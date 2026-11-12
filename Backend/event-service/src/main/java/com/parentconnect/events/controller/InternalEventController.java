package com.parentconnect.events.controller;

import com.parentconnect.events.config.OpenApiConfig;
import com.parentconnect.events.dto.ErrorResponse;
import com.parentconnect.events.dto.internal.ActiveSeatReservationResponse;
import com.parentconnect.events.dto.internal.EventSnapshotResponse;
import com.parentconnect.events.dto.internal.SeatReleaseRequest;
import com.parentconnect.events.dto.internal.SeatReleaseResponse;
import com.parentconnect.events.dto.internal.SeatReservationRequest;
import com.parentconnect.events.dto.internal.SeatReservationResponse;
import com.parentconnect.events.service.SeatReservationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Endpoints interservices, non exposés par l'API Gateway et protégés par la clé X-Internal-Api-Key.
 */
@Validated
@RestController
@RequestMapping("/internal")
@RequiredArgsConstructor
@Tag(name = "Interne - Réservations", description = "Utilisé exclusivement par Participation Service")
@SecurityRequirement(name = OpenApiConfig.INTERNAL_SCHEME)
@ApiResponse(responseCode = "401", description = "Clé interne absente ou invalide",
        content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
public class InternalEventController {

    private final SeatReservationService seatReservationService;

    @GetMapping("/events/{eventId}")
    @Operation(summary = "Informations d'un événement nécessaires aux inscriptions")
    @ApiResponse(responseCode = "200", description = "Instantané de l'événement")
    @ApiResponse(responseCode = "404", description = "Événement introuvable",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public EventSnapshotResponse getEvent(@PathVariable UUID eventId) {
        return seatReservationService.getSnapshot(eventId);
    }

    @PostMapping("/events/{eventId}/reservations")
    @Operation(summary = "Réserver une place (atomique et idempotent)",
            description = "Rejouer la même operationId ne consomme jamais de seconde place.")
    @ApiResponse(responseCode = "200", description = "Place réservée (ou déjà détenue)")
    @ApiResponse(responseCode = "404", description = "Événement introuvable",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "Événement annulé, passé, complet, organisateur ou opération annulée",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public SeatReservationResponse reserve(@PathVariable UUID eventId,
                                           @Valid @RequestBody SeatReservationRequest request) {
        return seatReservationService.reserve(eventId, request.userId(), request.operationId());
    }

    @PostMapping("/events/{eventId}/reservations/release")
    @Operation(summary = "Libérer une place (idempotent, sans double libération)")
    @ApiResponse(responseCode = "200", description = "Résultat de la libération")
    @ApiResponse(responseCode = "404", description = "Événement introuvable",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public SeatReleaseResponse release(@PathVariable UUID eventId, @Valid @RequestBody SeatReleaseRequest request) {
        return seatReservationService.release(eventId, request.userId(), request.operationId(),
                request.requireIdleSeconds());
    }

    @GetMapping("/reservations/active")
    @Operation(summary = "Lister les places actives inchangées depuis un délai (réconciliation)",
            description = "Pagination par clé : passer l'id du dernier élément reçu dans afterId.")
    public List<ActiveSeatReservationResponse> activeReservations(
            @Parameter(description = "Ancienneté minimale de la dernière modification, en secondes")
            @RequestParam(defaultValue = "120") @Min(0) int idleForSeconds,
            @Parameter(description = "Curseur : id du dernier élément de la page précédente")
            @RequestParam(required = false) UUID afterId,
            @RequestParam(defaultValue = "200") @Min(1) @Max(1000) int limit) {
        return seatReservationService.findActiveReservations(idleForSeconds, afterId, limit);
    }
}
