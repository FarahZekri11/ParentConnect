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
        LocalDateTime joinedAt,
        LocalDateTime cancelledAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
