package com.parentconnect.participations.messaging;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Implémentation par défaut quand RabbitMQ n'est pas activé : les notifications sont journalisées.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.messaging.rabbitmq.enabled", havingValue = "false", matchIfMissing = true)
public class LoggingEventNotificationPublisher implements EventNotificationPublisher {

    @Override
    public void publish(EventNotificationMessage message) {
        log.info("[NOTIFICATION] type={} routingKey={} eventId={} title='{}' actor={} recipients={} occurredAt={} messageId={}",
                message.type(), message.type().routingKey(), message.eventId(), message.eventTitle(),
                message.actorUserId(), message.recipientUserIds(), message.occurredAt(), message.messageId());
    }
}
