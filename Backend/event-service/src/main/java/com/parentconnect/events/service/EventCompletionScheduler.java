package com.parentconnect.events.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Passe automatiquement au statut COMPLETED les événements publiés dont la date de fin est dépassée.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.scheduling.complete-events.enabled", havingValue = "true", matchIfMissing = true)
public class EventCompletionScheduler {

    private final EventService eventService;

    @Scheduled(fixedDelayString = "${app.scheduling.complete-events.interval:PT10M}",
            initialDelayString = "${app.scheduling.complete-events.initial-delay:PT1M}")
    public void completeFinishedEvents() {
        int updated = eventService.completeFinishedEvents();
        if (updated > 0) {
            log.info("{} événement(s) passé(s) au statut COMPLETED", updated);
        }
    }
}
