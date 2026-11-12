package com.parentconnect.participations.service;

import com.parentconnect.participations.entity.Participation;
import com.parentconnect.participations.entity.ParticipationStatus;
import com.parentconnect.participations.repository.ParticipationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Écritures locales courtes, chacune dans sa propre transaction.
 * Les appels réseau vers Event Service ne sont JAMAIS faits à l'intérieur d'une transaction de base de données.
 */
@Component
@RequiredArgsConstructor
public class ParticipationStore {

    private final ParticipationRepository repository;

    /**
     * Crée ou réactive la participation (une seule ligne par couple événement/utilisateur).
     * Une inscription concurrente provoque une violation de la contrainte d'unicité ou du verrou optimiste.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Participation confirm(UUID eventId, UUID userId, UUID operationId, LocalDateTime now) {
        Participation participation = repository.findByEventIdAndUserId(eventId, userId)
                .orElseGet(() -> Participation.builder().eventId(eventId).userId(userId).build());
        participation.confirm(operationId, now);
        return repository.saveAndFlush(participation);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Participation cancel(UUID participationId, LocalDateTime now) {
        Participation participation = repository.findById(participationId).orElseThrow();
        participation.cancel(now);
        return repository.saveAndFlush(participation);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<Participation> find(UUID eventId, UUID userId) {
        return repository.findByEventIdAndUserId(eventId, userId);
    }

    /** Vrai si une inscription confirmée existe déjà pour cette opération de réservation. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<Participation> findConfirmedWithOperation(UUID eventId, UUID userId, UUID operationId) {
        return repository.findByEventIdAndUserId(eventId, userId)
                .filter(p -> p.getStatus() == ParticipationStatus.CONFIRMED)
                .filter(p -> p.getReservationOperationId().equals(operationId));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void adoptOperation(UUID participationId, UUID operationId) {
        repository.findById(participationId).ifPresent(p -> {
            p.setReservationOperationId(operationId);
            repository.save(p);
        });
    }
}
