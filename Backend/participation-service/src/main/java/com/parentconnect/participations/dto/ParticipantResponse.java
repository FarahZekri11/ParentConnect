package com.parentconnect.participations.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;
import java.util.UUID;

@Schema(description = "Participant confirmé d'un événement (visible par l'organisateur ou un ADMIN)")
public record ParticipantResponse(
        UUID participationId,
        UUID userId,
        LocalDateTime joinedAt
) {
}
