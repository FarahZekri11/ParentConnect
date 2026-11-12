package com.parentconnect.events.dto.internal;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "Résultat d'une libération de place")
public record SeatReleaseResponse(
        UUID eventId,
        UUID userId,
        @Schema(description = "Vrai si une place a effectivement été libérée par cet appel") boolean released,
        @Schema(description = "RELEASED, ALREADY_RELEASED, NOT_FOUND_TOMBSTONED, OPERATION_MISMATCH, RECENTLY_UPDATED")
        String outcome,
        int reservedPlaces,
        int availablePlaces
) {
}
