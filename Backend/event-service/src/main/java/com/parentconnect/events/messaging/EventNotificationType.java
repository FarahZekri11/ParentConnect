package com.parentconnect.events.messaging;

/**
 * Notifications métier publiées par Event Service à destination de Messaging Service.
 * Clé de routage RabbitMQ au format {@code <service>.<entite>.<action>}.
 */
public enum EventNotificationType {
    EventUpdated("event.event.updated"),
    EventCancelled("event.event.cancelled");

    private final String routingKey;

    EventNotificationType(String routingKey) {
        this.routingKey = routingKey;
    }

    public String routingKey() {
        return routingKey;
    }
}
