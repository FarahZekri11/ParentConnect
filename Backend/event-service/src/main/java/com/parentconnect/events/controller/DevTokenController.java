package com.parentconnect.events.controller;

import com.parentconnect.events.security.DevJwtTokenService;
import com.parentconnect.events.security.Roles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Outil de test sans Keycloak : disponible uniquement avec le profil "dev".
 */
@Validated
@RestController
@Profile("dev")
@RequestMapping("/dev")
@RequiredArgsConstructor
@Tag(name = "Développement", description = "Génération de JWT de démonstration (profil dev uniquement)")
public class DevTokenController {

    public static final UUID DEMO_ORGANIZER = UUID.fromString("11111111-1111-1111-1111-111111111111");
    public static final UUID DEMO_PARENT = UUID.fromString("22222222-2222-2222-2222-222222222222");
    public static final UUID DEMO_PARENT_2 = UUID.fromString("33333333-3333-3333-3333-333333333333");
    public static final UUID DEMO_ADMIN = UUID.fromString("99999999-9999-9999-9999-999999999999");

    private final DevJwtTokenService tokenService;

    @GetMapping("/tokens")
    @SecurityRequirements
    @Operation(summary = "Générer un JWT de démonstration",
            description = """
                    Utilisateurs de démo : organisateur 11111111-1111-1111-1111-111111111111 (PARENT),
                    parent 22222222-2222-2222-2222-222222222222, parent 33333333-3333-3333-3333-333333333333,
                    admin 99999999-9999-9999-9999-999999999999. Sans userId, l'utilisateur de démo du rôle est utilisé.
                    """)
    public DevJwtTokenService.IssuedToken token(
            @Parameter(description = "PARENT, PROFESSIONAL (ou PROFESSIONNEL) ou ADMIN") @RequestParam(defaultValue = Roles.PARENT) String role,
            @Parameter(description = "Identifiant utilisateur (UUID)") @RequestParam(required = false) UUID userId,
            @Parameter(description = "Durée de validité en minutes") @RequestParam(defaultValue = "120")
            @Min(1) @Max(1440) int validityMinutes) {
        String normalizedRole = role.trim().toUpperCase();
        UUID subject = userId != null ? userId
                : Roles.ADMIN.equals(normalizedRole) ? DEMO_ADMIN : DEMO_PARENT;
        return tokenService.issue(subject, List.of(normalizedRole), Duration.ofMinutes(validityMinutes));
    }
}
