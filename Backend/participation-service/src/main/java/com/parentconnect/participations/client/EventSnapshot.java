package com.parentconnect.participations.client;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Informations fiables sur un événement, fournies par Event Service (jamais par le client HTTP).
 */
public record EventSnapshot(
        UUID id,
        String title,
        UUID organizerId,
        String status,
        LocalDateTime startDateTime,
        LocalDateTime endDateTime,
        int capacity,
        int reservedPlaces,
        int availablePlaces,
        boolean openForRegistration
) {
    public static final String PUBLISHED = "PUBLISHED";
    public static final String CANCELLED = "CANCELLED";
    public static final String COMPLETED = "COMPLETED";

    public boolean isCancelled() {
        return CANCELLED.equals(status);
    }

    public boolean hasStarted(LocalDateTime now) {
        return COMPLETED.equals(status) || !startDateTime.isAfter(now);
    }
}
