package com.parentconnect.events.dto.internal;

import com.parentconnect.events.entity.EventStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;
import java.util.UUID;

@Schema(description = "Vue interne d'un événement destinée à Participation Service")
public record EventSnapshotResponse(
        UUID id,
        String title,
        UUID organizerId,
        EventStatus status,
        LocalDateTime startDateTime,
        LocalDateTime endDateTime,
        int capacity,
        int reservedPlaces,
        int availablePlaces,
        @Schema(description = "Vrai si l'événement accepte actuellement des inscriptions") boolean openForRegistration
) {
}
