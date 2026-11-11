package com.parentconnect.rabbitmq.controller;

import com.parentconnect.rabbitmq.consumer.MarketplaceEventConsumer;
import com.parentconnect.rabbitmq.dto.MarketplaceEvent;
import com.parentconnect.rabbitmq.producer.MarketplaceEventProducer;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Contrôleur de test REST pour RabbitMQ
 * 
 * Permet au professeur et aux étudiants de tester directement:
 * 1. La publication d'un message AMQP via RabbitTemplate
 * 2. La réception du message consommé par @RabbitListener
 */
@RestController
@RequestMapping("/api/events")
public class RabbitMQEventController {

    private final MarketplaceEventProducer producer;
    private final MarketplaceEventConsumer consumer;

    public RabbitMQEventController(MarketplaceEventProducer producer, MarketplaceEventConsumer consumer) {
        this.producer = producer;
        this.consumer = consumer;
    }

    @PostMapping("/publish")
    public ResponseEntity<MarketplaceEvent> publishTestEvent(
            @RequestParam(defaultValue = "listing.created") String eventType,
            @RequestBody(required = false) Map<String, Object> customPayload) {
        
        Map<String, Object> payload = customPayload != null ? customPayload : new HashMap<>();
        if (payload.isEmpty()) {
            payload.put("title", "Poussette Bébé Confort");
            payload.put("category", "BABY_GEAR");
            payload.put("price", 45.0);
            payload.put("author", "farah");
        }

        MarketplaceEvent event = producer.publishEvent("listing.created", eventType, payload);
        return ResponseEntity.ok(event);
    }

    @GetMapping("/received")
    public ResponseEntity<List<MarketplaceEvent>> getReceivedEvents() {
        return ResponseEntity.ok(consumer.getReceivedEvents());
    }
}
