package com.parentconnect.participations.controller;

import com.parentconnect.participations.dto.ErrorResponse;
import com.parentconnect.participations.dto.PageResponse;
import com.parentconnect.participations.dto.ParticipantResponse;
import com.parentconnect.participations.dto.ParticipationResponse;
import com.parentconnect.participations.entity.ParticipationStatus;
import com.parentconnect.participations.exception.InvalidRequestException;
import com.parentconnect.participations.security.CurrentUserProvider;
import com.parentconnect.participations.service.ParticipationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;
import java.util.UUID;

/**
 * Routes publiques sous /api/events (compatibilité front / API Gateway), implémentées par Participation Service.
 * L'API Gateway doit router explicitement ces chemins vers ce service (voir README).
 */
@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
@Tag(name = "Participations", description = "Inscription, désinscription et consultation des participations")
@ApiResponse(responseCode = "401", description = "Token absent, expiré ou invalide",
        content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
@ApiResponse(responseCode = "503", description = "Event Service indisponible",
        content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
public class ParticipationController {

    private static final Set<String> SORT_FIELDS = Set.of("joinedAt", "createdAt", "updatedAt", "status");

    private final ParticipationService participationService;
    private final CurrentUserProvider currentUserProvider;

    @PostMapping("/{id}/join")
    @Operation(summary = "S'inscrire à un événement",
            description = "L'utilisateur est celui du JWT. Une inscription annulée est réactivée si des places sont disponibles.")
    @ApiResponse(responseCode = "201", description = "Inscription confirmée")
    @ApiResponse(responseCode = "403", description = "Rôle non autorisé",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "404", description = "Événement introuvable",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "Déjà inscrit, événement complet, annulé, passé, ou propre événement",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public ResponseEntity<ParticipationResponse> join(@Parameter(description = "Identifiant de l'événement")
                                                      @PathVariable("id") UUID eventId) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(participationService.join(eventId, currentUserProvider.get()));
    }

    @DeleteMapping("/{id}/leave")
    @Operation(summary = "Se désinscrire d'un événement", description = "Libère la place réservée.")
    @ApiResponse(responseCode = "204", description = "Désinscription effectuée")
    @ApiResponse(responseCode = "404", description = "Aucune inscription active",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "Événement déjà commencé ou terminé",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public ResponseEntity<Void> leave(@PathVariable("id") UUID eventId) {
        participationService.leave(eventId, currentUserProvider.get());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/participants")
    @Operation(summary = "Participants confirmés d'un événement", description = "Réservé à l'organisateur ou à un ADMIN.")
    @ApiResponse(responseCode = "200", description = "Page de participants")
    @ApiResponse(responseCode = "403", description = "Ni organisateur ni ADMIN",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "404", description = "Événement introuvable",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public PageResponse<ParticipantResponse> participants(
            @PathVariable("id") UUID eventId,
            @ParameterObject @PageableDefault(size = 50, sort = "joinedAt", direction = Sort.Direction.ASC)
            Pageable pageable) {
        return participationService.participants(eventId, currentUserProvider.get(), validate(pageable));
    }

    @GetMapping("/me/joined")
    @Operation(summary = "Mes participations", description = "Par défaut toutes les participations ; filtrable par statut.")
    @ApiResponse(responseCode = "200", description = "Page de participations")
    public PageResponse<ParticipationResponse> myParticipations(
            @Parameter(description = "CONFIRMED ou CANCELLED") @RequestParam(required = false) ParticipationStatus status,
            @ParameterObject @PageableDefault(size = 20, sort = "joinedAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return participationService.myParticipations(currentUserProvider.get(), status, validate(pageable));
    }

    private static Pageable validate(Pageable pageable) {
        for (Sort.Order order : pageable.getSort()) {
            if (!SORT_FIELDS.contains(order.getProperty())) {
                throw new InvalidRequestException("Tri non autorisé sur '" + order.getProperty()
                        + "'. Valeurs possibles : " + SORT_FIELDS);
            }
        }
        return pageable;
    }
}
