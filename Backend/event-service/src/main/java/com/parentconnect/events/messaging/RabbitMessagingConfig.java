package com.parentconnect.events.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Déclarations RabbitMQ (créées si absentes, sans effet si l'intégrateur les a déjà déclarées à l'identique) :
 * <ul>
 *   <li>exchange topic partagé {@code parentconnect.topic} (durable) ;</li>
 *   <li>queue dédiée du service {@code event_events_queue} (durable) : réservée aux messages destinés à
 *       Event Service. Il ne consomme aucun événement aujourd'hui : aucune liaison n'est créée, afin de ne pas
 *       accumuler ses propres messages.</li>
 * </ul>
 * Format des messages : JSON (Jackson).
 */
@Configuration
@ConditionalOnProperty(name = "app.messaging.rabbitmq.enabled", havingValue = "true")
public class RabbitMessagingConfig {

    @Bean
    public TopicExchange parentConnectTopicExchange(@Value("${app.messaging.exchange:parentconnect.topic}") String name) {
        return new TopicExchange(name, true, false);
    }

    @Bean
    public Queue serviceEventsQueue(@Value("${app.messaging.queue:event_events_queue}") String name) {
        return new Queue(name, true);
    }

    @Bean
    public MessageConverter jacksonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }
}
