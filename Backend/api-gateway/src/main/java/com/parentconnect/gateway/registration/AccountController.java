package com.parentconnect.gateway.registration;

import com.parentconnect.gateway.registration.KeycloakAdminClient.KeycloakException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.Map;

import static com.parentconnect.gateway.registration.RegistrationController.blank;
import static com.parentconnect.gateway.registration.RegistrationController.error;

/**
 * Compte de l'utilisateur connecté (identité = « sub » du token vérifié par la Gateway) :
 * GET /api/auth/me · PUT /api/auth/me (prénom, nom) · PUT /api/auth/me/password.
 */
@RestController
@RequestMapping("/api/auth/me")
public class AccountController {

    private final KeycloakAdminClient keycloak;

    public AccountController(KeycloakAdminClient keycloak) {
        this.keycloak = keycloak;
    }

    public record ProfileUpdate(String firstName, String lastName) { }

    public record PasswordChange(String currentPassword, String newPassword) { }

    @GetMapping
    public Mono<ResponseEntity<Map<String, Object>>> me(@AuthenticationPrincipal Jwt jwt) {
        return keycloak.getUser(jwt.getSubject())
                .zipWith(keycloak.realmRolesOf(jwt.getSubject()))
                .map(t -> {
                    Map<String, Object> u = t.getT1();
                    Map<String, Object> body = new HashMap<>();
                    body.put("id", u.get("id"));
                    body.put("email", u.get("email"));
                    body.put("firstName", u.get("firstName"));
                    body.put("lastName", u.get("lastName"));
                    body.put("createdTimestamp", u.get("createdTimestamp"));
                    body.put("roles", t.getT2());
                    return ResponseEntity.ok(body);
                })
                .onErrorResume(KeycloakException.class, e -> Mono.just(error(e.status(), e.getMessage())));
    }

    @PutMapping
    public Mono<ResponseEntity<Map<String, Object>>> updateProfile(@AuthenticationPrincipal Jwt jwt,
                                                                   @RequestBody ProfileUpdate update) {
        if (update == null || blank(update.firstName()) || blank(update.lastName())
                || update.firstName().trim().length() > 50 || update.lastName().trim().length() > 50) {
            return Mono.just(error(HttpStatus.BAD_REQUEST, "Prénom et nom obligatoires (50 caractères maximum)."));
        }
        return keycloak.updateUser(jwt.getSubject(),
                        Map.of("firstName", update.firstName().trim(), "lastName", update.lastName().trim()))
                .thenReturn(ResponseEntity.ok(Map.<String, Object>of("message", "Profil mis à jour")))
                .onErrorResume(KeycloakException.class, e -> Mono.just(error(e.status(), e.getMessage())));
    }

    @PutMapping("/password")
    public Mono<ResponseEntity<Map<String, Object>>> changePassword(@AuthenticationPrincipal Jwt jwt,
                                                                    @RequestBody PasswordChange change) {
        if (change == null || blank(change.currentPassword()) || change.newPassword() == null
                || change.newPassword().length() < 8 || change.newPassword().length() > 128) {
            return Mono.just(error(HttpStatus.BAD_REQUEST, "Le nouveau mot de passe doit contenir entre 8 et 128 caractères."));
        }
        if (change.newPassword().equals(change.currentPassword())) {
            return Mono.just(error(HttpStatus.BAD_REQUEST, "Le nouveau mot de passe doit être différent de l'actuel."));
        }
        String username = jwt.getClaimAsString("preferred_username");
        return keycloak.checkPassword(username, change.currentPassword())
                .flatMap(ok -> ok
                        ? keycloak.resetPassword(jwt.getSubject(), change.newPassword())
                                .thenReturn(ResponseEntity.ok(Map.<String, Object>of("message", "Mot de passe modifié")))
                        : Mono.just(error(HttpStatus.BAD_REQUEST, "Mot de passe actuel incorrect.")))
                .onErrorResume(KeycloakException.class, e -> Mono.just(error(e.status(), e.getMessage())));
    }
}
