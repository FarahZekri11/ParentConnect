package com.parentconnect.gateway.registration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Accès à l'API d'administration Keycloak du realm « parentconnect » via le compte de service du client
 * confidentiel « parentconnect-registration » (droits : manage-users, view-users, query-users, view-realm).
 * Utilisé par l'inscription, la gestion du compte et l'administration des utilisateurs.
 */
@Component
public class KeycloakAdminClient {

    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() { };
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() { };

    private final WebClient keycloak;
    private final String realm;
    private final String clientId;
    private final String clientSecret;
    private final String publicClientId;
    private final AtomicReference<CachedToken> cachedToken = new AtomicReference<>();

    private record CachedToken(String value, Instant expiresAt) { }

    /** Erreur métier renvoyée telle quelle au client (statut + message). */
    public static final class KeycloakException extends RuntimeException {
        private final HttpStatus status;

        public KeycloakException(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }

        public HttpStatus status() {
            return status;
        }
    }

    public KeycloakAdminClient(
            @Value("${registration.keycloak-url:http://keycloak:8180}") String keycloakUrl,
            @Value("${registration.realm:parentconnect}") String realm,
            @Value("${registration.client-id:parentconnect-registration}") String clientId,
            @Value("${registration.client-secret:}") String clientSecret,
            @Value("${registration.public-client-id:frontend-parentconnect}") String publicClientId) {
        this.keycloak = WebClient.builder().baseUrl(keycloakUrl)
                .codecs(c -> c.defaultCodecs().maxInMemorySize(4 * 1024 * 1024)).build();
        this.realm = realm;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.publicClientId = publicClientId;
    }

    public boolean isConfigured() {
        return clientSecret != null && !clientSecret.isBlank();
    }

    // ---------------------------------------------------------------- jeton
    /** Jeton du compte de service, mis en cache jusqu'à 30 s avant son expiration. */
    public Mono<String> token() {
        CachedToken cached = cachedToken.get();
        if (cached != null && Instant.now().isBefore(cached.expiresAt())) {
            return Mono.just(cached.value());
        }
        return keycloak.post()
                .uri("/realms/{realm}/protocol/openid-connect/token", realm)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData("grant_type", "client_credentials")
                        .with("client_id", clientId)
                        .with("client_secret", clientSecret))
                .retrieve()
                .bodyToMono(MAP)
                .map(body -> {
                    String value = String.valueOf(body.get("access_token"));
                    long expiresIn = body.get("expires_in") instanceof Number n ? n.longValue() : 60;
                    cachedToken.set(new CachedToken(value, Instant.now().plusSeconds(Math.max(10, expiresIn - 30))));
                    return value;
                });
    }

    /** Vérifie un mot de passe en tentant une connexion (client public du frontend). */
    public Mono<Boolean> checkPassword(String username, String password) {
        return keycloak.post()
                .uri("/realms/{realm}/protocol/openid-connect/token", realm)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData("grant_type", "password")
                        .with("client_id", publicClientId)
                        .with("username", username)
                        .with("password", password))
                .exchangeToMono(r -> r.releaseBody().thenReturn(r.statusCode().is2xxSuccessful()));
    }

    // ---------------------------------------------------------- utilisateurs
    public Mono<String> createUser(Map<String, Object> user) {
        return token().flatMap(t -> keycloak.post()
                .uri("/admin/realms/{realm}/users", realm)
                .headers(h -> h.setBearerAuth(t))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(user)
                .exchangeToMono(response -> {
                    int code = response.statusCode().value();
                    if (code == 201) {
                        String location = response.headers().asHttpHeaders().getFirst("Location");
                        if (location == null) {
                            return Mono.error(new IllegalStateException("Réponse Keycloak sans en-tête Location"));
                        }
                        return response.releaseBody().thenReturn(location.substring(location.lastIndexOf('/') + 1));
                    }
                    if (code == 409) {
                        return response.releaseBody().then(Mono.error(new KeycloakException(HttpStatus.CONFLICT,
                                "Un compte existe déjà avec cette adresse e-mail.")));
                    }
                    if (code == 400) {
                        return response.bodyToMono(MAP).defaultIfEmpty(Map.of())
                                .flatMap(body -> Mono.error(new KeycloakException(HttpStatus.BAD_REQUEST,
                                        "Compte refusé par Keycloak : " + body.getOrDefault("errorMessage", "données invalides"))));
                    }
                    return response.releaseBody().then(Mono.error(
                            new IllegalStateException("Création refusée par Keycloak : HTTP " + code)));
                }));
    }

    public Mono<Map<String, Object>> getUser(String userId) {
        return token().flatMap(t -> keycloak.get()
                .uri("/admin/realms/{realm}/users/{id}", realm, userId)
                .headers(h -> h.setBearerAuth(t))
                .retrieve()
                .bodyToMono(MAP))
                .onErrorMap(WebClientResponseException.NotFound.class,
                        e -> new KeycloakException(HttpStatus.NOT_FOUND, "Utilisateur introuvable."));
    }

    /** Mise à jour partielle (firstName, lastName, email, enabled...). */
    public Mono<Void> updateUser(String userId, Map<String, Object> changes) {
        return token().flatMap(t -> keycloak.put()
                .uri("/admin/realms/{realm}/users/{id}", realm, userId)
                .headers(h -> h.setBearerAuth(t))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(changes)
                .exchangeToMono(r -> {
                    if (r.statusCode().is2xxSuccessful()) return r.releaseBody();
                    if (r.statusCode().value() == 409) {
                        return r.releaseBody().then(Mono.error(new KeycloakException(HttpStatus.CONFLICT,
                                "Cette adresse e-mail est déjà utilisée par un autre compte.")));
                    }
                    if (r.statusCode().value() == 404) {
                        return r.releaseBody().then(Mono.error(new KeycloakException(HttpStatus.NOT_FOUND, "Utilisateur introuvable.")));
                    }
                    return r.bodyToMono(String.class).defaultIfEmpty("").flatMap(body -> Mono.error(
                            new KeycloakException(HttpStatus.BAD_REQUEST, "Modification refusée par Keycloak.")));
                }));
    }

    public Mono<Void> resetPassword(String userId, String newPassword) {
        return token().flatMap(t -> keycloak.put()
                .uri("/admin/realms/{realm}/users/{id}/reset-password", realm, userId)
                .headers(h -> h.setBearerAuth(t))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("type", "password", "value", newPassword, "temporary", false))
                .retrieve()
                .toBodilessEntity()
                .then());
    }

    public Mono<Void> deleteUser(String userId) {
        return token().flatMap(t -> keycloak.delete()
                .uri("/admin/realms/{realm}/users/{id}", realm, userId)
                .headers(h -> h.setBearerAuth(t))
                .retrieve()
                .toBodilessEntity()
                .then());
    }

    /** Recherche paginée (nom, prénom, e-mail, identifiant). */
    public Mono<List<Map<String, Object>>> listUsers(String search, int first, int max) {
        return token().flatMap(t -> keycloak.get()
                .uri(b -> {
                    b.path("/admin/realms/{realm}/users").queryParam("first", first).queryParam("max", max)
                            .queryParam("briefRepresentation", false);
                    if (search != null && !search.isBlank()) b.queryParam("search", search.trim());
                    return b.build(realm);
                })
                .headers(h -> h.setBearerAuth(t))
                .retrieve()
                .bodyToMono(LIST));
    }

    public Mono<Long> countUsers() {
        return token().flatMap(t -> keycloak.get()
                .uri("/admin/realms/{realm}/users/count", realm)
                .headers(h -> h.setBearerAuth(t))
                .retrieve()
                .bodyToMono(Long.class));
    }

    /** Utilisateurs ayant un rôle du realm (au plus {@code max}). */
    public Mono<List<Map<String, Object>>> usersInRole(String role, int max) {
        return token().flatMap(t -> keycloak.get()
                .uri("/admin/realms/{realm}/roles/{role}/users?first=0&max={max}", realm, role, max)
                .headers(h -> h.setBearerAuth(t))
                .retrieve()
                .bodyToMono(LIST))
                .onErrorResume(WebClientResponseException.NotFound.class, e -> Mono.just(List.of()));
    }

    // ----------------------------------------------------------------- rôles
    public Mono<List<String>> realmRolesOf(String userId) {
        return token().flatMap(t -> keycloak.get()
                .uri("/admin/realms/{realm}/users/{id}/role-mappings/realm", realm, userId)
                .headers(h -> h.setBearerAuth(t))
                .retrieve()
                .bodyToMono(LIST))
                .map(list -> list.stream().map(r -> String.valueOf(r.get("name"))).toList());
    }

    public Mono<Void> addRealmRole(String userId, String roleName) {
        return changeRealmRole(userId, roleName, true);
    }

    public Mono<Void> removeRealmRole(String userId, String roleName) {
        return changeRealmRole(userId, roleName, false);
    }

    private Mono<Void> changeRealmRole(String userId, String roleName, boolean add) {
        return token().flatMap(t -> keycloak.get()
                .uri("/admin/realms/{realm}/roles/{role}", realm, roleName)
                .headers(h -> h.setBearerAuth(t))
                .retrieve()
                .bodyToMono(MAP)
                .flatMap(role -> (add ? keycloak.post() : keycloak.method(org.springframework.http.HttpMethod.DELETE))
                        .uri("/admin/realms/{realm}/users/{id}/role-mappings/realm", realm, userId)
                        .headers(h -> h.setBearerAuth(t))
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(List.of(role))
                        .retrieve()
                        .toBodilessEntity())
                .then())
                .timeout(Duration.ofSeconds(15));
    }
}
