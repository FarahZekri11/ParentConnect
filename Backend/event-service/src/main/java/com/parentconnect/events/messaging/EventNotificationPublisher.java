package com.parentconnect.events.messaging;

/**
 * Abstraction de publication des notifications métier.
 * Implémentation par défaut : journalisation. RABBITMQ_ENABLED=true : publication sur l'exchange parentconnect.topic.
 */
public interface EventNotificationPublisher {

    void publish(EventNotificationMessage message);
}
