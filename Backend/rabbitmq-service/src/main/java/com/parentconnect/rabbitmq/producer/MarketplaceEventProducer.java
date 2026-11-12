package com.parentconnect.rabbitmq.producer;

import com.parentconnect.rabbitmq.dto.MarketplaceEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.Map;
import java.util.UUID;

/**
 * Producteur RabbitMQ avec RabbitTemplate
 * 
 * Permet de publier des messages vers l'échange 'parentconnect.marketplace.exchange'
 */
@Service
public class MarketplaceEventProducer {

    private static final Logger log = LoggerFactory.getLogger(MarketplaceEventProducer.class);

    private final RabbitTemplate rabbitTemplate;

    @Value("${parentconnect.rabbitmq.exchange:parentconnect.marketplace.exchange}")
    private String exchange;

    public MarketplaceEventProducer(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public MarketplaceEvent publishEvent(String routingKey, String eventType, Map<String, Object> payload) {
        String eventId = UUID.randomUUID().toString();
        MarketplaceEvent event = new MarketplaceEvent(eventId, eventType, new Date(), payload);

        log.info("[RabbitMQ Producer] Envoi de l'événement '{}' vers l'exchange '{}' avec la clé '{}'", 
                eventType, exchange, routingKey);

        rabbitTemplate.convertAndSend(exchange, routingKey, event);
        return event;
    }
}
