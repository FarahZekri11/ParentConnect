package com.parentconnect.events.dto;

import com.parentconnect.events.entity.EventCategory;
import com.parentconnect.events.entity.EventStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;
import java.util.UUID;

@Schema(description = "Événement")
public record EventResponse(
        UUID id,
        String title,
        String description,
        EventCategory category,
        LocalDateTime startDateTime,
        LocalDateTime endDateTime,
        String locationName,
        String address,
        String city,
        Double latitude,
        Double longitude,
        Integer capacity,
        Integer reservedPlaces,
        @Schema(description = "Nombre de places encore disponibles") Integer availablePlaces,
        @Schema(description = "Vrai si l'événement est complet") boolean full,
        Integer minChildAge,
        Integer maxChildAge,
        UUID organizerId,
        EventStatus status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
