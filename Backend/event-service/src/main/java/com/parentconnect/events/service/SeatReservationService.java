package com.parentconnect.events.service;

import com.parentconnect.events.dto.internal.ActiveSeatReservationResponse;
import com.parentconnect.events.dto.internal.EventSnapshotResponse;
import com.parentconnect.events.dto.internal.SeatReleaseResponse;
import com.parentconnect.events.dto.internal.SeatReservationResponse;
import com.parentconnect.events.entity.Event;
import com.parentconnect.events.entity.EventStatus;
import com.parentconnect.events.entity.SeatReservation;
import com.parentconnect.events.entity.SeatReservationStatus;
import com.parentconnect.events.exception.BusinessConflictException;
import com.parentconnect.events.exception.ResourceNotFoundException;
import com.parentconnect.events.mapper.EventMapper;
import com.parentconnect.events.repository.EventRepository;
import com.parentconnect.events.repository.SeatReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Réservation et libération atomiques des places, appelées par Participation Service.
 *
 * <h2>Garanties</h2>
 * <ul>
 *   <li><b>Atomicité / pas de surréservation</b> : chaque opération verrouille la ligne de l'événement
 *       (SELECT ... FOR UPDATE) ; la vérification de capacité et l'incrément sont faits dans la même transaction.
 *       Une contrainte CHECK SQL (reserved_places &lt;= capacity) sert de dernier garde-fou.</li>
 *   <li><b>Idempotence</b> : une ligne de registre par couple (événement, utilisateur) mémorise l'operationId
 *       qui détient la place. Rejouer la même opération ne consomme jamais une seconde place.</li>
 *   <li><b>Pas de double libération</b> : la libération est conditionnée à l'operationId détenteur et à l'état ACTIVE.</li>
 *   <li><b>Pierre tombale</b> : libérer une opération inconnue enregistre un état RELEASED pour cette opération ;
 *       une réservation retardée par le réseau qui arriverait ensuite est refusée.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SeatReservationService {

    private final EventRepository eventRepository;
    private final SeatReservationRepository seatReservationRepository;
    private final EventMapper eventMapper;
    private final Clock clock;

    @Transactional(readOnly = true)
    public EventSnapshotResponse getSnapshot(UUID eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Événement introuvable : " + eventId));
        return eventMapper.toSnapshot(event, LocalDateTime.now(clock));
    }

    @Transactional
    public SeatReservationResponse reserve(UUID eventId, UUID userId, UUID operationId) {
        LocalDateTime now = LocalDateTime.now(clock);
        Event event = lockEvent(eventId);
        Optional<SeatReservation> existing = seatReservationRepository.findByEventIdAndUserId(eventId, userId);

        if (existing.isPresent()) {
            SeatReservation reservation = existing.get();
            if (reservation.getOperationId().equals(operationId) && !reservation.isActive()) {
                throw new BusinessConflictException("Cette opération de réservation a déjà été annulée");
            }
            if (reservation.isActive()) {
                // Rejeu de la même opération, ou place déjà détenue par une opération antérieure :
                // aucune place supplémentaire n'est consommée.
                checkEventAcceptsRegistrations(event, userId, now, false);
                reservation.touch(now);
                boolean alreadyHeld = !reservation.getOperationId().equals(operationId);
                return toResponse(event, reservation, alreadyHeld);
            }
        }

        checkEventAcceptsRegistrations(event, userId, now, true);
        event.occupySeat();

        SeatReservation reservation = existing.orElseGet(() -> SeatReservation.builder()
                .eventId(eventId)
                .userId(userId)
                .createdAt(now)
                .build());
        reservation.activate(operationId, now);
        seatReservationRepository.save(reservation);
        eventRepository.save(event);

        log.info("Place réservée : event={} user={} operation={} ({}/{})",
                eventId, userId, operationId, event.getReservedPlaces(), event.getCapacity());
        return toResponse(event, reservation, false);
    }

    @Transactional
    public SeatReleaseResponse release(UUID eventId, UUID userId, UUID operationId, Integer requireIdleSeconds) {
        LocalDateTime now = LocalDateTime.now(clock);
        Event event = lockEvent(eventId);
        Optional<SeatReservation> existing = seatReservationRepository.findByEventIdAndUserId(eventId, userId);

        if (existing.isEmpty()) {
            // Pierre tombale : protège contre une réservation de cette opération arrivant en retard.
            seatReservationRepository.save(SeatReservation.builder()
                    .eventId(eventId)
                    .userId(userId)
                    .operationId(operationId)
                    .status(SeatReservationStatus.RELEASED)
                    .createdAt(now)
                    .updatedAt(now)
                    .build());
            return releaseResponse(event, userId, false, "NOT_FOUND_TOMBSTONED");
        }

        SeatReservation reservation = existing.get();
        if (!reservation.getOperationId().equals(operationId)) {
            return releaseResponse(event, userId, false, "OPERATION_MISMATCH");
        }
        if (!reservation.isActive()) {
            return releaseResponse(event, userId, false, "ALREADY_RELEASED");
        }
        if (requireIdleSeconds != null && reservation.getUpdatedAt().isAfter(now.minusSeconds(requireIdleSeconds))) {
            return releaseResponse(event, userId, false, "RECENTLY_UPDATED");
        }

        reservation.release(now);
        event.freeSeat();
        seatReservationRepository.save(reservation);
        eventRepository.save(event);
        log.info("Place libérée : event={} user={} operation={} ({}/{})",
                eventId, userId, operationId, event.getReservedPlaces(), event.getCapacity());
        return releaseResponse(event, userId, true, "RELEASED");
    }

    @Transactional(readOnly = true)
    public List<ActiveSeatReservationResponse> findActiveReservations(int idleForSeconds, UUID afterId, int limit) {
        LocalDateTime idleSince = LocalDateTime.now(clock).minusSeconds(idleForSeconds);
        return seatReservationRepository.findActiveIdleSince(idleSince, afterId, PageRequest.of(0, limit)).stream()
                .map(r -> new ActiveSeatReservationResponse(r.getId(), r.getEventId(), r.getUserId(),
                        r.getOperationId(), r.getUpdatedAt()))
                .toList();
    }

    private Event lockEvent(UUID eventId) {
        return eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Événement introuvable : " + eventId));
    }

    private void checkEventAcceptsRegistrations(Event event, UUID userId, LocalDateTime now, boolean needsNewSeat) {
        if (event.getStatus() == EventStatus.CANCELLED) {
            throw new BusinessConflictException("L'événement a été annulé");
        }
        if (event.getStatus() == EventStatus.COMPLETED || event.hasStarted(now)) {
            throw new BusinessConflictException("L'événement a déjà commencé ou est terminé");
        }
        if (event.isOrganizer(userId)) {
            throw new BusinessConflictException("Un organisateur ne peut pas s'inscrire à son propre événement");
        }
        if (needsNewSeat && event.isFull()) {
            throw new BusinessConflictException("L'événement est complet");
        }
    }

    private SeatReservationResponse toResponse(Event event, SeatReservation reservation, boolean alreadyHeld) {
        return new SeatReservationResponse(event.getId(), reservation.getUserId(), reservation.getOperationId(),
                reservation.getStatus(), alreadyHeld, event.getReservedPlaces(), event.availablePlaces());
    }

    private SeatReleaseResponse releaseResponse(Event event, UUID userId, boolean released, String outcome) {
        return new SeatReleaseResponse(event.getId(), userId, released, outcome,
                event.getReservedPlaces(), event.availablePlaces());
    }
}
