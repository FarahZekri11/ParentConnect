package com.parentconnect.events.dto;

import com.parentconnect.events.entity.EventCategory;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/**
 * Données de création (POST) ou de modification complète (PUT) d'un événement.
 * L'organisateur n'est jamais lu dans le corps : il provient du JWT.
 */
@Schema(description = "Données d'un événement (création ou modification)")
public record EventRequest(

        @Schema(example = "Pique-nique au parc", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "Le titre est obligatoire")
        @Size(max = 150, message = "Le titre ne doit pas dépasser 150 caractères")
        String title,

        @Schema(example = "Pique-nique convivial entre parents et enfants")
        @Size(max = 5000, message = "La description ne doit pas dépasser 5000 caractères")
        String description,

        @Schema(example = "SORTIE", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "La catégorie est obligatoire")
        EventCategory category,

        @Schema(example = "2026-11-15T14:00:00", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "La date de début est obligatoire")
        LocalDateTime startDateTime,

        @Schema(example = "2026-11-15T17:00:00", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "La date de fin est obligatoire")
        LocalDateTime endDateTime,

        @Schema(example = "Parc de la Tête d'Or")
        @Size(max = 150, message = "Le nom du lieu ne doit pas dépasser 150 caractères")
        String locationName,

        @Schema(example = "Place du Général Leclerc")
        @Size(max = 255, message = "L'adresse ne doit pas dépasser 255 caractères")
        String address,

        @Schema(example = "Lyon", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "La ville est obligatoire")
        @Size(max = 100, message = "La ville ne doit pas dépasser 100 caractères")
        String city,

        @Schema(example = "45.7772")
        @DecimalMin(value = "-90.0", message = "La latitude doit être comprise entre -90 et 90")
        @DecimalMax(value = "90.0", message = "La latitude doit être comprise entre -90 et 90")
        Double latitude,

        @Schema(example = "4.855")
        @DecimalMin(value = "-180.0", message = "La longitude doit être comprise entre -180 et 180")
        @DecimalMax(value = "180.0", message = "La longitude doit être comprise entre -180 et 180")
        Double longitude,

        @Schema(example = "20", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "La capacité est obligatoire")
        @Positive(message = "La capacité doit être strictement positive")
        @Max(value = 10000, message = "La capacité ne doit pas dépasser 10000")
        Integer capacity,

        @Schema(example = "2")
        @Min(value = 0, message = "L'âge minimum doit être positif")
        @Max(value = 18, message = "L'âge minimum ne doit pas dépasser 18 ans")
        Integer minChildAge,

        @Schema(example = "10")
        @Min(value = 0, message = "L'âge maximum doit être positif")
        @Max(value = 18, message = "L'âge maximum ne doit pas dépasser 18 ans")
        Integer maxChildAge
) {
}
