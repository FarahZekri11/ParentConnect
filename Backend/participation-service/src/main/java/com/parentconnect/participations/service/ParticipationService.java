package com.parentconnect.participations.service;

import com.parentconnect.participations.client.EventServiceClient;
import com.parentconnect.participations.client.EventSnapshot;
import com.parentconnect.participations.client.SeatReservationResult;
import com.parentconnect.participations.dto.JoinRequest;
import com.parentconnect.participations.dto.PageResponse;
import com.parentconnect.participations.dto.ParticipantResponse;
import com.parentconnect.participations.dto.ParticipationResponse;
import com.parentconnect.participations.entity.Participation;
import com.parentconnect.participations.entity.ParticipationStatus;
import com.parentconnect.participations.exception.BusinessConflictException;
import com.parentconnect.participations.exception.ForbiddenOperationException;
import com.parentconnect.participations.exception.ResourceNotFoundException;
import com.parentconnect.participations.exception.ServiceUnavailableException;
import com.parentconnect.participations.mapper.ParticipationMapper;
import com.parentconnect.participations.messaging.EventNotificationMessage;
import com.parentconnect.participations.messaging.EventNotificationType;
import com.parentconnect.participations.repository.ParticipationRepository;
import com.parentconnect.participations.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Orchestration des inscriptions (saga applicative entre deux bases indépendantes).
 *
 * <h2>Inscription</h2>
 * <ol>
 *   <li>Vérifications locales (déjà inscrit ?) puis lecture fiable de l'événement auprès d'Event Service.</li>
 *   <li>Réservation atomique et idempotente d'une place (operationId unique, nouvelles tentatives sûres).</li>
 *   <li>Enregistrement local de la participation CONFIRMED (transaction courte).</li>
 *   <li>En cas d'échec de l'étape 3 : <b>compensation</b> (libération de la place réservée par cette opération).
 *       Si la compensation échoue elle-même, la réconciliation périodique libère la place orpheline.</li>
 * </ol>
 *
 * <h2>Désinscription</h2>
 * La participation est d'abord annulée localement, puis la place est libérée (conditionnellement à l'operationId,
 * donc sans double libération). Si Event Service est injoignable, la réconciliation terminera la libération.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ParticipationService {

    private final ParticipationRepository participationRepository;
    private final ParticipationStore store;
    private final EventServiceClient eventServiceClient;
    private final ParticipationMapper mapper;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final Clock clock;

    public ParticipationResponse join(UUID eventId, CurrentUser user) {
        return join(eventId, user, null, JoinRequest.EMPTY);
    }

    /**
     * Inscription avec détails : nom affiché (issu du token), nombre d'enfants et message à l'organisateur.
     */
    public ParticipationResponse join(UUID eventId, CurrentUser user, String participantName, JoinRequest details) {
        JoinRequest joinDetails = details == null ? JoinRequest.EMPTY : details;
        UUID userId = user.userId();
        Optional<Participation> existing = store.find(eventId, userId);
        if (existing.isPresent() && existing.get().isConfirmed()) {
            throw new BusinessConflictException("Vous êtes déjà inscrit à cet événement");
        }

        LocalDateTime now = LocalDateTime.now(clock);
        EventSnapshot event = eventServiceClient.getEvent(eventId);
        checkRegistrationAllowed(event, userId, now);

        UUID operationId = UUID.randomUUID();
        SeatReservationResult reservation;
        try {
            reservation = eventServiceClient.reserveSeat(eventId, userId, operationId);
        } catch (ServiceUnavailableException ex) {
            // Issue inconnue : la réservation a peut-être été appliquée. On l'annule (idempotent, pierre tombale).
            compensate(eventId, userId, operationId, "réservation sans réponse");
            throw ex;
        }

        // L'opération qui détient la place (la nôtre, ou une précédente si la place était déjà détenue)
        UUID holderOperation = reservation.operationId();
        boolean createdByThisOperation = operationId.equals(holderOperation);

        Participation participation;
        try {
            participation = store.confirm(eventId, userId, holderOperation, LocalDateTime.now(clock),
                    participantName, joinDetails);
        } catch (DataIntegrityViolationException | OptimisticLockingFailureException ex) {
            // Inscription concurrente du même utilisateur (double clic) : l'autre requête a gagné.
            Optional<Participation> winner = store.findConfirmedWithOperation(eventId, userId, holderOperation);
            if (winner.isPresent()) {
                log.info("Inscription concurrente détectée pour event={} user={}, place déjà confirmée", eventId, userId);
                return mapper.toResponse(winner.get());
            }
            if (createdByThisOperation) {
                compensate(eventId, userId, operationId, "conflit d'enregistrement");
            }
            throw new BusinessConflictException("Inscription concurrente détectée, veuillez réessayer");
        } catch (RuntimeException ex) {
            if (createdByThisOperation) {
                compensate(eventId, userId, operationId, "échec d'enregistrement local");
            }
            log.error("Échec d'enregistrement de la participation event={} user={}", eventId, userId, ex);
            throw new ServiceUnavailableException("L'inscription n'a pas pu être enregistrée, veuillez réessayer", ex);
        }

        applicationEventPublisher.publishEvent(EventNotificationMessage.of(EventNotificationType.EventJoined,
                eventId, event.title(), userId, List.of(event.organizerId(), userId), now));
        log.info("Inscription confirmée event={} user={} operation={}", eventId, userId, holderOperation);
        return mapper.toResponse(participation);
    }

    public void leave(UUID eventId, CurrentUser user) {
        UUID userId = user.userId();
        Participation participation = store.find(eventId, userId)
                .filter(Participation::isConfirmed)
                .orElseThrow(() -> new ResourceNotFoundException("Aucune inscription active à cet événement"));

        LocalDateTime now = LocalDateTime.now(clock);
        EventSnapshot event = eventServiceClient.getEvent(eventId);
        if (!event.isCancelled() && event.hasStarted(now)) {
            throw new BusinessConflictException("Impossible de se désinscrire d'un événement déjà commencé ou terminé");
        }

        store.cancel(participation.getId(), now);
        try {
            eventServiceClient.releaseSeat(eventId, userId, participation.getReservationOperationId(), null);
        } catch (RuntimeException ex) {
            // La désinscription reste valide ; la place sera libérée par la réconciliation.
            log.warn("Libération différée de la place event={} user={} operation={} : {}", eventId, userId,
                    participation.getReservationOperationId(), ex.getMessage());
        }

        applicationEventPublisher.publishEvent(EventNotificationMessage.of(EventNotificationType.EventLeft,
                eventId, event.title(), userId, List.of(event.organizerId(), userId), now));
        log.info("Désinscription event={} user={}", eventId, userId);
    }

    @Transactional(readOnly = true)
    public PageResponse<ParticipationResponse> myParticipations(CurrentUser user, ParticipationStatus status,
                                                                Pageable pageable) {
        var page = status == null
                ? participationRepository.findByUserId(user.userId(), pageable)
                : participationRepository.findByUserIdAndStatus(user.userId(), status, pageable);
        return PageResponse.from(page, mapper::toResponse);
    }

    /**
     * Liste des participants confirmés. L'organisateur est déterminé à partir d'Event Service,
     * jamais à partir de données fournies par le client.
     */
    public PageResponse<ParticipantResponse> participants(UUID eventId, CurrentUser user, Pageable pageable) {
        EventSnapshot event = eventServiceClient.getEvent(eventId);
        if (!user.isAdmin() && !event.organizerId().equals(user.userId())) {
            throw new ForbiddenOperationException(
                    "Seul l'organisateur de l'événement ou un administrateur peut consulter les participants");
        }
        return PageResponse.from(
                participationRepository.findByEventIdAndStatus(eventId, ParticipationStatus.CONFIRMED, pageable),
                mapper::toParticipant);
    }

    private void checkRegistrationAllowed(EventSnapshot event, UUID userId, LocalDateTime now) {
        if (event.organizerId().equals(userId)) {
            throw new BusinessConflictException("Un organisateur ne peut pas s'inscrire à son propre événement");
        }
        if (event.isCancelled()) {
            throw new BusinessConflictException("L'événement a été annulé");
        }
        if (event.hasStarted(now)) {
            throw new BusinessConflictException("L'événement a déjà commencé ou est terminé");
        }
        if (event.availablePlaces() <= 0) {
            throw new BusinessConflictException("L'événement est complet");
        }
    }

    private void compensate(UUID eventId, UUID userId, UUID operationId, String reason) {
        try {
            var result = eventServiceClient.releaseSeat(eventId, userId, operationId, null);
            log.warn("Compensation ({}) event={} user={} operation={} -> {}", reason, eventId, userId, operationId,
                    result.outcome());
        } catch (RuntimeException ex) {
            log.error("Compensation impossible ({}) event={} user={} operation={} : la réconciliation s'en chargera",
                    reason, eventId, userId, operationId, ex);
        }
    }
}
