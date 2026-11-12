package com.parentconnect.gateway.registration;

import com.parentconnect.gateway.registration.KeycloakAdminClient.KeycloakException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Inscription publique : POST /api/auth/register.
 * <p>
 * Crée l'utilisateur dans Keycloak avec le rôle choisi : PARENT (défaut) ou BABYSITTER. Le rôle ADMIN ne peut
 * jamais être obtenu par l'inscription publique. Le mot de passe n'est ni journalisé ni conservé par la Gateway.
 */
@RestController
@RequestMapping("/api/auth")
public class RegistrationController {

    private static final Logger log = LoggerFactory.getLogger(RegistrationController.class);
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    static final String DEFAULT_ROLE = "PARENT";
    /** Rôles qu'un visiteur peut choisir lui-même. */
    static final Set<String> SELF_SERVICE_ROLES = Set.of("PARENT", "BABYSITTER");

    private final KeycloakAdminClient keycloak;

    public RegistrationController(KeycloakAdminClient keycloak) {
        this.keycloak = keycloak;
    }

    public record RegisterRequest(String firstName, String lastName, String email, String password, String role) {
        public RegisterRequest(String firstName, String lastName, String email, String password) {
            this(firstName, lastName, email, password, null);
        }
    }

    @PostMapping(value = "/register", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<Map<String, Object>>> register(@RequestBody RegisterRequest request) {
        String invalid = validate(request);
        if (invalid != null) {
            return Mono.just(error(HttpStatus.BAD_REQUEST, invalid));
        }
        String role = request.role() == null || request.role().isBlank()
                ? DEFAULT_ROLE : request.role().trim().toUpperCase(Locale.ROOT);
        if (!keycloak.isConfigured()) {
            return Mono.just(error(HttpStatus.SERVICE_UNAVAILABLE, "Inscription non configurée (secret du client Keycloak absent)."));
        }
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        Map<String, Object> user = Map.of(
                "username", email,
                "email", email,
                "firstName", request.firstName().trim(),
                "lastName", request.lastName().trim(),
                "enabled", true,
                "emailVerified", true,
                "credentials", List.of(Map.of("type", "password", "value", request.password(), "temporary", false)));

        return keycloak.createUser(user)
                .flatMap(userId -> keycloak.addRealmRole(userId, "USER")
                        .then(keycloak.addRealmRole(userId, role))
                        .thenReturn(userId))
                .map(userId -> {
                    log.info("[Registration] Nouveau compte {} : {}", role, userId);
                    return ResponseEntity.status(HttpStatus.CREATED)
                            .body(Map.<String, Object>of("id", userId, "role", role, "message", "Compte créé"));
                })
                .onErrorResume(KeycloakException.class, e -> Mono.just(error(e.status(), e.getMessage())))
                .onErrorResume(e -> {
                    log.error("[Registration] Échec de l'inscription : {}", e.toString());
                    return Mono.just(error(HttpStatus.SERVICE_UNAVAILABLE,
                            "Inscription momentanément indisponible, réessayez dans un instant."));
                });
    }

    static String validate(RegisterRequest r) {
        if (r == null) return "Données d'inscription manquantes.";
        if (blank(r.firstName()) || r.firstName().trim().length() > 50) return "Le prénom est obligatoire (50 caractères maximum).";
        if (blank(r.lastName()) || r.lastName().trim().length() > 50) return "Le nom est obligatoire (50 caractères maximum).";
        if (blank(r.email()) || r.email().length() > 120 || !EMAIL.matcher(r.email().trim()).matches()) return "Adresse e-mail invalide.";
        if (r.password() == null || r.password().length() < 8 || r.password().length() > 128) {
            return "Le mot de passe doit contenir entre 8 et 128 caractères.";
        }
        if (r.role() != null && !r.role().isBlank()
                && !SELF_SERVICE_ROLES.contains(r.role().trim().toUpperCase(Locale.ROOT))) {
            return "Rôle invalide : choisissez Parent ou Babysitter.";
        }
        return null;
    }

    static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }
}
