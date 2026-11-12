package com.parentconnect.events.service;

import com.parentconnect.events.dto.EventRequest;
import com.parentconnect.events.dto.EventResponse;
import com.parentconnect.events.dto.EventSearchCriteria;
import com.parentconnect.events.dto.PageResponse;
import com.parentconnect.events.entity.Event;
import com.parentconnect.events.entity.EventStatus;
import com.parentconnect.events.entity.SeatReservationStatus;
import com.parentconnect.events.exception.BusinessConflictException;
import com.parentconnect.events.exception.ForbiddenOperationException;
import com.parentconnect.events.exception.InvalidRequestException;
import com.parentconnect.events.exception.ResourceNotFoundException;
import com.parentconnect.events.mapper.EventMapper;
import com.parentconnect.events.messaging.EventNotificationMessage;
import com.parentconnect.events.messaging.EventNotificationType;
import com.parentconnect.events.repository.EventRepository;
import com.parentconnect.events.repository.EventSpecifications;
import com.parentconnect.events.repository.SeatReservationRepository;
import com.parentconnect.events.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class EventService {

    private final EventRepository eventRepository;
    private final SeatReservationRepository seatReservationRepository;
    private final EventMapper eventMapper;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final Clock clock;

    @Transactional
    public EventResponse create(EventRequest request, CurrentUser user) {
        LocalDateTime now = LocalDateTime.now(clock);
        validateRequest(request);
        if (!request.startDateTime().isAfter(now)) {
            throw new InvalidRequestException("La date de début doit être dans le futur");
        }
        Event event = eventMapper.toNewEntity(request, user.userId());
        Event saved = eventRepository.save(event);
        log.info("Événement {} créé par {}", saved.getId(), user.userId());
        return eventMapper.toResponse(saved);
    }

    @Transactional(readOnly = true)
    public EventResponse getById(UUID id) {
        return eventMapper.toResponse(findOrThrow(id));
    }

    @Transactional(readOnly = true)
    public PageResponse<EventResponse> search(EventSearchCriteria criteria, Pageable pageable) {
        validateCriteria(criteria);
        LocalDateTime now = LocalDateTime.now(clock);
        return PageResponse.from(
                eventRepository.findAll(EventSpecifications.fromCriteria(criteria, now), pageable),
                eventMapper::toResponse);
    }

    @Transactional(readOnly = true)
    public PageResponse<EventResponse> findOrganizedBy(CurrentUser user, EventStatus status, Pageable pageable) {
        var page = status == null
                ? eventRepository.findByOrganizerId(user.userId(), pageable)
                : eventRepository.findByOrganizerIdAndStatus(user.userId(), status, pageable);
        return PageResponse.from(page, eventMapper::toResponse);
    }

    /**
     * Modification complète. Le verrou pessimiste garantit que la vérification
     * "capacité >= places réservées" ne peut pas être contournée par une réservation simultanée.
     */
    @Transactional
    public EventResponse update(UUID id, EventRequest request, CurrentUser user) {
        LocalDateTime now = LocalDateTime.now(clock);
        validateRequest(request);
        Event event = eventRepository.findByIdForUpdate(id)
                .orElseThrow(() -> notFound(id));
        checkCanManage(event, user);

        if (event.getStatus() != EventStatus.PUBLISHED) {
            throw new BusinessConflictException("Seul un événement publié peut être modifié");
        }
        if (event.hasStarted(now)) {
            throw new BusinessConflictException("Un événement déjà commencé ne peut plus être modifié");
        }
        if (!request.startDateTime().isAfter(now)) {
            throw new InvalidRequestException("La date de début doit être dans le futur");
        }
        if (request.capacity() < event.getReservedPlaces()) {
            throw new BusinessConflictException("Impossible de réduire la capacité à " + request.capacity()
                    + " : " + event.getReservedPlaces() + " places sont déjà réservées");
        }

        eventMapper.applyRequest(event, request);
        Event saved = eventRepository.saveAndFlush(event);

        applicationEventPublisher.publishEvent(EventNotificationMessage.of(EventNotificationType.EventUpdated,
                saved.getId(), saved.getTitle(), user.userId(),
                seatReservationRepository.findUserIdsByEventIdAndStatus(saved.getId(), SeatReservationStatus.ACTIVE),
                now));
        log.info("Événement {} modifié par {}", saved.getId(), user.userId());
        return eventMapper.toResponse(saved);
    }

    /**
     * Annulation (DELETE). Idempotente : annuler un événement déjà annulé ne fait rien.
     * Les places réservées sont conservées pour l'historique ; plus aucune inscription n'est acceptée.
     */
    @Transactional
    public void cancel(UUID id, CurrentUser user) {
        LocalDateTime now = LocalDateTime.now(clock);
        Event event = eventRepository.findByIdForUpdate(id)
                .orElseThrow(() -> notFound(id));
        checkCanManage(event, user);

        if (event.getStatus() == EventStatus.CANCELLED) {
            return;
        }
        if (event.getStatus() == EventStatus.COMPLETED) {
            throw new BusinessConflictException("Un événement terminé ne peut pas être annulé");
        }
        event.setStatus(EventStatus.CANCELLED);
        eventRepository.saveAndFlush(event);

        applicationEventPublisher.publishEvent(EventNotificationMessage.of(EventNotificationType.EventCancelled,
                event.getId(), event.getTitle(), user.userId(),
                seatReservationRepository.findUserIdsByEventIdAndStatus(event.getId(), SeatReservationStatus.ACTIVE),
                now));
        log.info("Événement {} annulé par {}", event.getId(), user.userId());
    }

    @Transactional
    public int completeFinishedEvents() {
        return eventRepository.markFinishedEventsAsCompleted(LocalDateTime.now(clock));
    }

    private void checkCanManage(Event event, CurrentUser user) {
        if (!user.isAdmin() && !event.isOrganizer(user.userId())) {
            throw new ForbiddenOperationException("Seul l'organisateur ou un administrateur peut gérer cet événement");
        }
    }

    private void validateRequest(EventRequest request) {
        if (!request.endDateTime().isAfter(request.startDateTime())) {
            throw new InvalidRequestException("La date de fin doit être postérieure à la date de début");
        }
        if (request.minChildAge() != null && request.maxChildAge() != null
                && request.minChildAge() > request.maxChildAge()) {
            throw new InvalidRequestException("L'âge minimum doit être inférieur ou égal à l'âge maximum");
        }
        if ((request.latitude() == null) != (request.longitude() == null)) {
            throw new InvalidRequestException("La latitude et la longitude doivent être renseignées ensemble");
        }
    }

    private void validateCriteria(EventSearchCriteria criteria) {
        if ((criteria.lat() == null) != (criteria.lng() == null)) {
            throw new InvalidRequestException("Les paramètres lat et lng doivent être fournis ensemble");
        }
        if (criteria.radiusKm() != null && !criteria.hasGeoFilter()) {
            throw new InvalidRequestException("Le paramètre radiusKm nécessite lat et lng");
        }
        if (criteria.dateFrom() != null && criteria.dateTo() != null && criteria.dateTo().isBefore(criteria.dateFrom())) {
            throw new InvalidRequestException("dateTo doit être postérieure ou égale à dateFrom");
        }
    }

    private Event findOrThrow(UUID id) {
        return eventRepository.findById(id).orElseThrow(() -> notFound(id));
    }

    private static ResourceNotFoundException notFound(UUID id) {
        return new ResourceNotFoundException("Événement introuvable : " + id);
    }
}
