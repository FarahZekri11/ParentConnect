package com.parentconnect.events.dto.internal;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

@Schema(description = "Demande de réservation d'une place (idempotente par operationId)")
public record SeatReservationRequest(
        @NotNull(message = "userId est obligatoire") UUID userId,
        @NotNull(message = "operationId est obligatoire") UUID operationId
) {
}
