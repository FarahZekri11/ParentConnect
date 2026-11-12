package com.parentconnect.participations.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * Détails facultatifs d'une inscription (corps de POST /api/events/{id}/join, peut être omis).
 * Une inscription réserve une place (une famille) ; le nombre d'enfants est une information pour l'organisateur.
 */
@Schema(description = "Détails facultatifs de l'inscription")
public record JoinRequest(
        @Schema(example = "2", description = "Nombre d'enfants qui viennent (1 par défaut)")
        @Min(value = 1, message = "Le nombre d'enfants doit être d'au moins 1")
        @Max(value = 10, message = "Le nombre d'enfants ne doit pas dépasser 10")
        Integer childrenCount,

        @Schema(example = "Ma fille est allergique aux arachides", description = "Message à l'organisateur")
        @Size(max = 500, message = "Le message ne doit pas dépasser 500 caractères")
        String note
) {
    public static final JoinRequest EMPTY = new JoinRequest(null, null);

    public int childrenCountOrDefault() {
        return childrenCount == null ? 1 : childrenCount;
    }

    public String noteOrNull() {
        return note == null || note.isBlank() ? null : note.strip();
    }
}
