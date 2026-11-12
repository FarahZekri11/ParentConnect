package com.parentconnect.participations.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

@Schema(description = "Format uniforme des erreurs")
public record ErrorResponse(
        @Schema(example = "2026-10-29T15:00:00") LocalDateTime timestamp,
        @Schema(example = "409") int status,
        @Schema(example = "Conflict") String error,
        @Schema(example = "L'événement est complet") String message,
        @Schema(example = "/api/events/3fa85f64-5717-4562-b3fc-2c963f66afa6") String path
) {
}
