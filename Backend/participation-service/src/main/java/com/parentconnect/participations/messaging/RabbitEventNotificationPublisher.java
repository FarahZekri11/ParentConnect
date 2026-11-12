package com.parentconnect.participations.messaging;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Publication JSON sur l'exchange partagé {@code parentconnect.topic}, clé {@code participation.participation.<action>}.
 * Activée avec {@code RABBITMQ_ENABLED=true} (ou le profil "rabbitmq").
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.messaging.rabbitmq.enabled", havingValue = "true")
@RequiredArgsConstructor
public class RabbitEventNotificationPublisher implements EventNotificationPublisher {

    private final RabbitTemplate rabbitTemplate;

    @Value("${app.messaging.exchange:parentconnect.topic}")
    private String exchange;

    @Override
    public void publish(EventNotificationMessage message) {
        rabbitTemplate.convertAndSend(exchange, message.type().routingKey(), EventEnvelope.from(message));
        log.debug("Notification {} publiée sur {} ({})", message.type(), exchange, message.type().routingKey());
    }
}
