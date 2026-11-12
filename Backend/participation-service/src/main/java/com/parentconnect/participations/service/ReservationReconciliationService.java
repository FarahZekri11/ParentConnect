package com.parentconnect.participations.service;

import com.parentconnect.participations.client.ActiveSeatReservation;
import com.parentconnect.participations.client.EventServiceClient;
import com.parentconnect.participations.entity.Participation;
import com.parentconnect.participations.entity.ParticipationStatus;
import com.parentconnect.participations.repository.ParticipationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Réconciliation périodique des places entre Event Service (registre des places) et Participation Service.
 * <p>
 * Pour chaque place ACTIVE côté Event Service inchangée depuis {@code graceSeconds} :
 * <ul>
 *   <li>participation CONFIRMED avec la même opération → cohérent ;</li>
 *   <li>participation CONFIRMED avec une autre opération → la participation adopte l'opération détentrice ;</li>
 *   <li>aucune participation CONFIRMED → place orpheline (compensation ou libération échouée) : libération
 *       conditionnelle (même opération ET toujours inactive depuis graceSeconds), donc sans risque de course
 *       avec une inscription en cours.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.reconciliation.enabled", havingValue = "true", matchIfMissing = true)
public class ReservationReconciliationService {

    private final EventServiceClient eventServiceClient;
    private final ParticipationRepository participationRepository;

    @Value("${app.reconciliation.grace-seconds:120}")
    private int graceSeconds;

    @Value("${app.reconciliation.batch-size:200}")
    private int batchSize;

    @Scheduled(fixedDelayString = "${app.reconciliation.interval:PT5M}",
            initialDelayString = "${app.reconciliation.initial-delay:PT1M}")
    public void scheduledRun() {
        try {
            ReconciliationReport report = reconcile();
            if (report.released() > 0 || report.adopted() > 0) {
                log.warn("Réconciliation : {}", report);
            } else {
                log.debug("Réconciliation : {}", report);
            }
        } catch (RuntimeException ex) {
            log.warn("Réconciliation reportée : {}", ex.getMessage());
        }
    }

    public ReconciliationReport reconcile() {
        int checked = 0;
        int released = 0;
        int adopted = 0;
        UUID cursor = null;
        while (true) {
            var batch = eventServiceClient.listActiveReservations(graceSeconds, cursor, batchSize);
            if (batch.isEmpty()) {
                break;
            }
            Set<UUID> eventIds = batch.stream().map(ActiveSeatReservation::eventId).collect(Collectors.toSet());
            Set<UUID> userIds = batch.stream().map(ActiveSeatReservation::userId).collect(Collectors.toSet());
            Map<String, Participation> local = participationRepository.findAllByEventIdInAndUserIdIn(eventIds, userIds)
                    .stream()
                    .collect(Collectors.toMap(p -> key(p.getEventId(), p.getUserId()), Function.identity()));

            for (ActiveSeatReservation seat : batch) {
                checked++;
                Participation participation = local.get(key(seat.eventId(), seat.userId()));
                if (participation != null && participation.getStatus() == ParticipationStatus.CONFIRMED) {
                    if (!participation.getReservationOperationId().equals(seat.operationId())) {
                        participation.setReservationOperationId(seat.operationId());
                        participationRepository.save(participation);
                        adopted++;
                    }
                    continue;
                }
                try {
                    var result = eventServiceClient.releaseSeat(seat.eventId(), seat.userId(), seat.operationId(),
                            graceSeconds);
                    if (result.released()) {
                        released++;
                        log.warn("Place orpheline libérée event={} user={} operation={}", seat.eventId(),
                                seat.userId(), seat.operationId());
                    }
                } catch (RuntimeException ex) {
                    log.warn("Libération impossible event={} user={} : {}", seat.eventId(), seat.userId(), ex.getMessage());
                }
            }
            cursor = batch.get(batch.size() - 1).id();
            if (batch.size() < batchSize) {
                break;
            }
        }
        return new ReconciliationReport(checked, released, adopted);
    }

    private static String key(UUID eventId, UUID userId) {
        return eventId + ":" + userId;
    }

    public record ReconciliationReport(int checked, int released, int adopted) {
    }
}
