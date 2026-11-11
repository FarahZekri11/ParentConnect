package com.parentconnect.rabbitmq.consumer;

import com.parentconnect.rabbitmq.dto.MarketplaceEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Consommateur RabbitMQ avec annotation @RabbitListener
 * 
 * Écoute la file 'parentconnect.marketplace.queue' en arrière-plan.
 * Dès que le microservice Marketplace publie un événement (création d'article, emprunt, etc.),
 * cette méthode reçoit le message et traite la logique métier.
 */
@Service
public class MarketplaceEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(MarketplaceEventConsumer.class);

    private final List<MarketplaceEvent> receivedEvents = Collections.synchronizedList(new ArrayList<>());

    @RabbitListener(queues = "${parentconnect.rabbitmq.queue:parentconnect.marketplace.queue}")
    public void handleMarketplaceEvent(MarketplaceEvent event) {
        log.info("=================================================");
        log.info("[RabbitMQ Consumer] Événement reçu avec succès !");
        log.info("Type d'événement: {}", event.getEventType());
        log.info("ID Événement   : {}", event.getEventId());
        log.info("Horodatage     : {}", event.getTimestamp());
        log.info("Données (Payload): {}", event.getPayload());
        log.info("=================================================");

        // Stocke l'événement pour inspection ou historique
        receivedEvents.add(event);

        // Traitement métier selon le type d'événement
        switch (event.getEventType()) {
            case "listing.created":
                log.info("-> Action métier: Notifier les parents intéressés par la nouvelle annonce.");
                break;
            case "listing.borrowed":
                log.info("-> Action métier: Mettre à jour l'inventaire et envoyer un reçu de prêt.");
                break;
            case "listing.returned":
                log.info("-> Action métier: Remettre l'article en disponibilité.");
                break;
            default:
                log.info("-> Traitement générique pour l'événement: {}", event.getEventType());
                break;
        }
    }

    public List<MarketplaceEvent> getReceivedEvents() {
        return new ArrayList<>(receivedEvents);
    }
}
