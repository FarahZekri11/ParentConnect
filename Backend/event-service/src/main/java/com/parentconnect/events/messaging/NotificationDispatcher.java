package com.parentconnect.events.messaging;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Publie les notifications uniquement après validation (commit) de la transaction métier :
 * aucune notification n'est envoyée pour une modification annulée (rollback).
 * Une panne du système de messagerie n'invalide jamais l'opération métier.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationDispatcher {

    private final EventNotificationPublisher publisher;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onNotification(EventNotificationMessage message) {
        try {
            publisher.publish(message);
        } catch (RuntimeException ex) {
            log.error("Échec de publication de la notification {} pour l'événement {}",
                    message.type(), message.eventId(), ex);
        }
    }
}
