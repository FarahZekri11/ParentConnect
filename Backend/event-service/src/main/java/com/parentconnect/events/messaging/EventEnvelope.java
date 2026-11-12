package com.parentconnect.events.messaging;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Enveloppe commune du bus d'événements ParentConnect (contrat Messaging Service) :
 * {@code {"event_id", "type", "version", "occurred_at", "data"}}.
 * {@code event_id} sert à l'idempotence côté consommateur ; {@code occurred_at} est au format RFC 3339 (avec fuseau).
 */
public record EventEnvelope(
        @JsonProperty("event_id") String eventId,
        @JsonProperty("type") String type,
        @JsonProperty("version") String version,
        @JsonProperty("occurred_at") String occurredAt,
        @JsonProperty("data") Map<String, Object> data
) {

    public static final String VERSION = "1.0";

    public static EventEnvelope from(EventNotificationMessage message) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("event_id", message.eventId().toString());
        data.put("event_title", message.eventTitle());
        data.put("actor_user_id", message.actorUserId() == null ? null : message.actorUserId().toString());
        data.put("recipient_user_ids", message.recipientUserIds().stream().map(UUID::toString).toList());
        String occurredAt = message.occurredAt().atZone(ZoneId.systemDefault())
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        return new EventEnvelope(message.messageId().toString(), message.type().name(), VERSION, occurredAt, data);
    }
}
