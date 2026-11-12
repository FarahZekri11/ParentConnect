package com.parentconnect.events.dto.internal;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

@Schema(description = "Demande de libération d'une place (idempotente, conditionnée à operationId)")
public record SeatReleaseRequest(
        @NotNull(message = "userId est obligatoire") UUID userId,
        @NotNull(message = "operationId est obligatoire") UUID operationId,
        @Schema(description = "Si renseigné, ne libère que si la réservation n'a pas été modifiée depuis ce nombre de secondes (réconciliation)")
        @Min(value = 0, message = "requireIdleSeconds doit être positif") Integer requireIdleSeconds
) {
}
