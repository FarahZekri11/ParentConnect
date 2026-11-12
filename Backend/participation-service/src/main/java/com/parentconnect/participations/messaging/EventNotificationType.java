package com.parentconnect.participations.messaging;

/**
 * Notifications métier publiées par Participation Service à destination de Messaging Service.
 * Clé de routage RabbitMQ au format {@code <service>.<entite>.<action>}.
 */
public enum EventNotificationType {
    EventJoined("participation.participation.joined"),
    EventLeft("participation.participation.left");

    private final String routingKey;

    EventNotificationType(String routingKey) {
        this.routingKey = routingKey;
    }

    public String routingKey() {
        return routingKey;
    }
}
