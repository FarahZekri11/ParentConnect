package com.parentconnect.participations.dto;

import com.parentconnect.participations.entity.ParticipationStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;
import java.util.UUID;

@Schema(description = "Participation d'un utilisateur à un événement")
public record ParticipationResponse(
        UUID id,
        UUID eventId,
        UUID userId,
        ParticipationStatus status,
        @Schema(description = "Nombre d'enfants qui viennent", example = "2") Integer childrenCount,
        @Schema(description = "Message à l'organisateur") String note,
        LocalDateTime joinedAt,
        LocalDateTime cancelledAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
