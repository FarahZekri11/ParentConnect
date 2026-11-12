package com.parentconnect.events.controller;

import com.parentconnect.events.dto.ErrorResponse;
import com.parentconnect.events.dto.EventRequest;
import com.parentconnect.events.dto.EventResponse;
import com.parentconnect.events.dto.EventSearchCriteria;
import com.parentconnect.events.dto.PageResponse;
import com.parentconnect.events.entity.EventCategory;
import com.parentconnect.events.entity.EventStatus;
import com.parentconnect.events.security.CurrentUserProvider;
import com.parentconnect.events.service.EventService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.time.LocalDate;
import java.util.UUID;

@Validated
@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
@Tag(name = "Événements", description = "Création, consultation, recherche, modification et annulation d'événements")
@ApiResponse(responseCode = "401", description = "Token absent, expiré ou invalide",
        content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
public class EventController {

    private final EventService eventService;
    private final CurrentUserProvider currentUserProvider;

    @PostMapping
    @Operation(summary = "Créer un événement", description = "Réservé aux administrateurs (ADMIN). "
            + "L'organisateur est l'utilisateur du JWT.")
    @ApiResponse(responseCode = "201", description = "Événement créé")
    @ApiResponse(responseCode = "400", description = "Données invalides (titre manquant, dates incohérentes, capacité <= 0...)",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "403", description = "Rôle non autorisé",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public ResponseEntity<EventResponse> create(@Valid @RequestBody EventRequest request) {
        EventResponse created = eventService.create(request, currentUserProvider.get());
        var location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}")
                .buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping
    @Operation(summary = "Lister et rechercher des événements",
            description = """
                    Tous les filtres sont facultatifs et combinables. Par défaut seuls les événements PUBLISHED sont renvoyés.
                    Le filtre géographique (lat, lng, radiusKm) utilise la formule de Haversine ; rayon par défaut : 10 km.
                    Tri possible : startDateTime, endDateTime, createdAt, title, city, capacity, category (ex : sort=startDateTime,asc).
                    """)
    @ApiResponse(responseCode = "200", description = "Page d'événements")
    @ApiResponse(responseCode = "400", description = "Filtres invalides",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public PageResponse<EventResponse> search(
            @Parameter(description = "Ville (insensible à la casse)", example = "Lyon")
            @RequestParam(required = false) String city,
            @Parameter(description = "Catégorie") @RequestParam(required = false) EventCategory category,
            @Parameter(description = "Début au plus tôt ce jour (yyyy-MM-dd)", example = "2026-11-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @Parameter(description = "Début au plus tard ce jour inclus (yyyy-MM-dd)", example = "2026-11-30")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @Parameter(description = "Âge de l'enfant (années)", example = "5")
            @RequestParam(required = false) @Min(value = 0, message = "childAge doit être positif")
            @Max(value = 18, message = "childAge ne doit pas dépasser 18") Integer childAge,
            @Parameter(description = "Latitude du point de recherche", example = "45.764")
            @RequestParam(required = false) @DecimalMin(value = "-90.0", message = "lat invalide")
            @DecimalMax(value = "90.0", message = "lat invalide") Double lat,
            @Parameter(description = "Longitude du point de recherche", example = "4.8357")
            @RequestParam(required = false) @DecimalMin(value = "-180.0", message = "lng invalide")
            @DecimalMax(value = "180.0", message = "lng invalide") Double lng,
            @Parameter(description = "Rayon de recherche en km (défaut 10)", example = "5")
            @RequestParam(required = false) @Positive(message = "radiusKm doit être strictement positif")
            @Max(value = 20000, message = "radiusKm trop grand") Double radiusKm,
            @Parameter(description = "Uniquement les événements à venir avec des places disponibles")
            @RequestParam(required = false, defaultValue = "false") Boolean onlyAvailable,
            @Parameter(description = "Statut (défaut PUBLISHED)") @RequestParam(required = false) EventStatus status,
            @Parameter(description = "Recherche dans le titre, la description, le lieu et la ville", example = "atelier")
            @RequestParam(required = false) @Size(max = 100, message = "La recherche ne doit pas dépasser 100 caractères")
            String q,
            @ParameterObject @PageableDefault(size = 20, sort = "startDateTime", direction = Sort.Direction.ASC)
            Pageable pageable) {
        var criteria = new EventSearchCriteria(city, category, dateFrom, dateTo, childAge, lat, lng, radiusKm,
                onlyAvailable, status, q);
        return eventService.search(criteria, PageableValidator.validate(pageable, PageableValidator.EVENT_SORT_FIELDS));
    }

    @GetMapping("/me/organized")
    @Operation(summary = "Mes événements créés")
    @ApiResponse(responseCode = "200", description = "Page des événements organisés par l'utilisateur courant")
    public PageResponse<EventResponse> myOrganizedEvents(
            @Parameter(description = "Filtrer par statut") @RequestParam(required = false) EventStatus status,
            @ParameterObject @PageableDefault(size = 20, sort = "startDateTime", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return eventService.findOrganizedBy(currentUserProvider.get(), status,
                PageableValidator.validate(pageable, PageableValidator.EVENT_SORT_FIELDS));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Détails d'un événement")
    @ApiResponse(responseCode = "200", description = "Événement trouvé")
    @ApiResponse(responseCode = "404", description = "Événement introuvable",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public EventResponse getById(@PathVariable UUID id) {
        return eventService.getById(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un événement", description = "Réservé à l'organisateur ou à un ADMIN. "
            + "La capacité ne peut pas descendre sous le nombre de places réservées.")
    @ApiResponse(responseCode = "200", description = "Événement modifié")
    @ApiResponse(responseCode = "400", description = "Données invalides",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "403", description = "L'utilisateur n'est ni l'organisateur ni ADMIN",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "404", description = "Événement introuvable",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "Événement annulé/terminé/commencé ou capacité insuffisante",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public EventResponse update(@PathVariable UUID id, @Valid @RequestBody EventRequest request) {
        return eventService.update(id, request, currentUserProvider.get());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Annuler un événement", description = "Passe l'événement au statut CANCELLED (idempotent). "
            + "Réservé à l'organisateur ou à un ADMIN.")
    @ApiResponse(responseCode = "204", description = "Événement annulé")
    @ApiResponse(responseCode = "403", description = "L'utilisateur n'est ni l'organisateur ni ADMIN",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "404", description = "Événement introuvable",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "Événement déjà terminé",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public ResponseEntity<Void> cancel(@PathVariable UUID id) {
        eventService.cancel(id, currentUserProvider.get());
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }
}
