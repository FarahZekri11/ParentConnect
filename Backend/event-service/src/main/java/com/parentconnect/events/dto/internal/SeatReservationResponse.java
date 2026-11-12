package com.parentconnect.events.dto.internal;

import com.parentconnect.events.entity.SeatReservationStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "Résultat d'une réservation de place")
public record SeatReservationResponse(
        UUID eventId,
        UUID userId,
        @Schema(description = "Identifiant de l'opération qui détient réellement la place") UUID operationId,
        SeatReservationStatus status,
        @Schema(description = "Vrai si la place était déjà détenue par une opération antérieure (aucune place consommée)")
        boolean alreadyHeld,
        int reservedPlaces,
        int availablePlaces
) {
}
