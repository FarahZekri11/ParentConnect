package com.parentconnect.rabbitmq.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.Serializable;
import java.util.Date;
import java.util.Map;

/**
 * Modèle d'événement échangé via RabbitMQ
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class MarketplaceEvent implements Serializable {

    private String eventId;
    private String eventType; // listing.created, listing.borrowed, listing.returned, listing.deleted, listing.updated
    private Date timestamp;
    private Map<String, Object> payload;

    public MarketplaceEvent() {
    }

    public MarketplaceEvent(String eventId, String eventType, Date timestamp, Map<String, Object> payload) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.timestamp = timestamp;
        this.payload = payload;
    }

    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }

    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }

    public Date getTimestamp() { return timestamp; }
    public void setTimestamp(Date timestamp) { this.timestamp = timestamp; }

    public Map<String, Object> getPayload() { return payload; }
    public void setPayload(Map<String, Object> payload) { this.payload = payload; }

    @Override
    public String toString() {
        return "MarketplaceEvent{" +
                "eventId='" + eventId + '\'' +
                ", eventType='" + eventType + '\'' +
                ", timestamp=" + timestamp +
                ", payload=" + payload +
                '}';
    }
}
