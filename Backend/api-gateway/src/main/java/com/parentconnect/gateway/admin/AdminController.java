package com.parentconnect.gateway.admin;

import com.parentconnect.gateway.registration.KeycloakAdminClient;
import com.parentconnect.gateway.registration.KeycloakAdminClient.KeycloakException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Administration (rôle ADMIN exigé par SecurityConfig sur /api/admin/**).
 *
 * <ul>
 *   <li>GET /api/admin/stats — statistiques réelles : comptes Keycloak (par rôle, inscriptions par jour) et compteurs
 *   de chaque module, obtenus en appelant les routes de la Gateway avec le jeton de l'administrateur (mêmes contrôles
 *   que pour toute requête). Un module indisponible est signalé « available: false », jamais remplacé par un chiffre.</li>
 *   <li>GET /api/admin/users — liste, recherche, filtre par rôle ; PUT /api/admin/users/{id} (nom, prénom, e-mail) ;
 *   PUT .../enabled (suspendre / réactiver) ; PUT .../role ; DELETE /api/admin/users/{id}.</li>
 * </ul>
 * Garde-fous : un administrateur ne peut ni se suspendre, ni se supprimer, ni retirer son propre rôle ADMIN, et le
 * dernier administrateur actif ne peut pas perdre ce rôle. Aucun contenu de conversation privée n'est accessible ici.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    /** Rôles métier attribuables par l'administrateur (un seul à la fois, en plus de USER). */
    static final List<String> BUSINESS_ROLES = List.of("PARENT", "BABYSITTER", "ADMIN");
    private static final List<String> ALL_BUSINESS_ROLES = List.of("ADMIN", "PROFESSIONAL", "BABYSITTER", "PARENT");
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() { };
    private static final int MAX_USERS_SCANNED = 5000;

    private final KeycloakAdminClient keycloak;
    private final WebClient self;

    public AdminController(KeycloakAdminClient keycloak, @Value("${server.port:8080}") int port) {
        this.keycloak = keycloak;
        this.self = WebClient.builder().baseUrl("http://127.0.0.1:" + port)
                .codecs(c -> c.defaultCodecs().maxInMemorySize(2 * 1024 * 1024)).build();
    }

    // ================================================================= statistiques
    @GetMapping("/stats")
    public Mono<Map<String, Object>> stats(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        Mono<Map<String, Object>> users = userStats();
        Mono<Map<String, Object>> modules = Flux.concat(
                module("events", "/api/events?size=1&status=PUBLISHED", authorization, b -> single("published", b.get("totalElements"))),
                module("participations", "/api/admin/participations/stats", authorization, b -> b),
                module("babysitting", "/api/babysitting/admin/stats", authorization, b -> b),
                module("marketplace", "/api/listings/admin/stats", authorization, b -> b),
                module("community", "/api/posts?page=1", authorization, b -> single("posts", meta(b, "total"))),
                module("reports", "/api/admin/reports", authorization,
                        b -> single("pending", meta(b, "total") != null ? meta(b, "total")
                                : (b.get("data") instanceof List<?> l ? l.size() : null))),
                module("messaging", "/api/messages/admin/stats", authorization, b -> b.get("data") instanceof Map<?, ?> d ? castMap(d) : b),
                module("geo", "/api/geo/admin/stats", authorization, b -> b))
                .collectMap(Map.Entry::getKey, Map.Entry::getValue, LinkedHashMap::new);
        return Mono.zip(users, modules).map(t -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("generatedAt", Instant.now().toString());
            out.put("users", t.getT1());
            out.put("modules", t.getT2());
            return out;
        });
    }

    /** Map à une entrée acceptant une valeur nulle (Map.of la refuse). */
    private static Map<String, Object> single(String key, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(key, value);
        return m;
    }

    private static Object meta(Map<String, Object> body, String key) {
        return body.get("meta") instanceof Map<?, ?> m ? m.get(key) : null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Map<?, ?> m) {
        return (Map<String, Object>) m;
    }

    private Mono<Map.Entry<String, Object>> module(String name, String path, String authorization,
                                                   java.util.function.Function<Map<String, Object>, Object> extract) {
        return self.get().uri(path)
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .retrieve()
                .bodyToMono(MAP)
                .timeout(Duration.ofSeconds(6))
                .map(body -> {
                    Map<String, Object> value = new LinkedHashMap<>();
                    value.put("available", true);
                    Object extracted = extract.apply(body);
                    if (extracted instanceof Map<?, ?> m) {
                        m.forEach((k, v) -> value.put(String.valueOf(k), v));
                    }
                    return Map.<String, Object>entry(name, value);
                })
                .onErrorResume(e -> Mono.just(Map.entry(name, Map.of("available", false))));
    }

    private Mono<Map<String, Object>> userStats() {
        Mono<Map<String, Set<String>>> roleMembers = Flux.fromIterable(ALL_BUSINESS_ROLES)
                .flatMap(role -> keycloak.usersInRole(role, MAX_USERS_SCANNED)
                        .map(list -> Map.entry(role, idsOf(list))))
                .collectMap(Map.Entry::getKey, Map.Entry::getValue);
        return Mono.zip(keycloak.countUsers(), keycloak.listUsers(null, 0, MAX_USERS_SCANNED), roleMembers)
                .map(t -> {
                    List<Map<String, Object>> all = t.getT2();
                    Map<String, Set<String>> members = t.getT3();
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", t.getT1());
                    Map<String, Object> byRole = new LinkedHashMap<>();
                    for (String role : ALL_BUSINESS_ROLES) {
                        byRole.put(role, members.getOrDefault(role, Set.of()).size());
                    }
                    out.put("byRole", byRole);
                    out.put("disabled", all.stream().filter(u -> Boolean.FALSE.equals(u.get("enabled"))).count());

                    // Inscriptions des 30 derniers jours (date de création Keycloak)
                    LocalDate today = LocalDate.now(ZoneOffset.UTC);
                    Map<String, Integer> perDay = new LinkedHashMap<>();
                    for (int i = 29; i >= 0; i--) {
                        perDay.put(today.minusDays(i).toString(), 0);
                    }
                    for (Map<String, Object> u : all) {
                        if (u.get("createdTimestamp") instanceof Number ts) {
                            String day = Instant.ofEpochMilli(ts.longValue()).atZone(ZoneOffset.UTC).toLocalDate().toString();
                            perDay.computeIfPresent(day, (k, v) -> v + 1);
                        }
                    }
                    List<Map<String, Object>> series = new ArrayList<>();
                    perDay.forEach((day, count) -> series.add(Map.of("date", day, "count", count)));
                    out.put("registrationsByDay", series);

                    // Inscriptions récentes (sans service-account)
                    List<Map<String, Object>> recent = all.stream()
                            .filter(u -> !String.valueOf(u.get("username")).startsWith("service-account-"))
                            .sorted(Comparator.comparingLong((Map<String, Object> u) ->
                                    u.get("createdTimestamp") instanceof Number n ? n.longValue() : 0L).reversed())
                            .limit(8)
                            .map(u -> toUserView(u, rolesFromMembership(String.valueOf(u.get("id")), members)))
                            .toList();
                    out.put("recent", recent);
                    return out;
                });
    }

    private static Set<String> idsOf(List<Map<String, Object>> users) {
        Set<String> ids = new HashSet<>();
        users.forEach(u -> ids.add(String.valueOf(u.get("id"))));
        return ids;
    }

    private static List<String> rolesFromMembership(String id, Map<String, Set<String>> members) {
        List<String> roles = new ArrayList<>();
        for (String role : ALL_BUSINESS_ROLES) {
            if (members.getOrDefault(role, Set.of()).contains(id)) roles.add(role);
        }
        return roles;
    }

    private static Map<String, Object> toUserView(Map<String, Object> u, List<String> roles) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", u.get("id"));
        view.put("username", u.get("username"));
        view.put("email", u.get("email"));
        view.put("firstName", u.get("firstName"));
        view.put("lastName", u.get("lastName"));
        view.put("enabled", u.get("enabled"));
        view.put("createdTimestamp", u.get("createdTimestamp"));
        view.put("roles", roles);
        view.put("role", roles.isEmpty() ? null : roles.get(0));
        return view;
    }

    // ================================================================= utilisateurs
    @GetMapping("/users")
    public Mono<Map<String, Object>> users(@RequestParam(required = false) String search,
                                           @RequestParam(required = false) String role,
                                           @RequestParam(defaultValue = "0") int first,
                                           @RequestParam(defaultValue = "20") int max) {
        int size = Math.max(1, Math.min(max, 100));
        int offset = Math.max(0, first);
        String wanted = role == null || role.isBlank() ? null : role.trim().toUpperCase(Locale.ROOT);
        Mono<Map<String, Set<String>>> roleMembers = Flux.fromIterable(ALL_BUSINESS_ROLES)
                .flatMap(r -> keycloak.usersInRole(r, MAX_USERS_SCANNED).map(list -> Map.entry(r, idsOf(list))))
                .collectMap(Map.Entry::getKey, Map.Entry::getValue);
        return Mono.zip(keycloak.listUsers(search, 0, MAX_USERS_SCANNED), roleMembers).map(t -> {
            List<Map<String, Object>> filtered = t.getT1().stream()
                    .filter(u -> !String.valueOf(u.get("username")).startsWith("service-account-"))
                    .map(u -> toUserView(u, rolesFromMembership(String.valueOf(u.get("id")), t.getT2())))
                    .filter(u -> wanted == null || ((List<?>) u.get("roles")).contains(wanted))
                    .sorted(Comparator.comparingLong((Map<String, Object> u) ->
                            u.get("createdTimestamp") instanceof Number n ? n.longValue() : 0L).reversed())
                    .toList();
            Map<String, Object> page = new LinkedHashMap<>();
            page.put("total", filtered.size());
            page.put("first", offset);
            page.put("max", size);
            page.put("items", filtered.stream().skip(offset).limit(size).toList());
            return page;
        });
    }

    public record UserUpdate(String firstName, String lastName, String email) { }

    public record EnabledUpdate(Boolean enabled) { }

    public record RoleUpdate(String role) { }

    @PutMapping("/users/{id}")
    public Mono<ResponseEntity<Map<String, Object>>> updateUser(@PathVariable String id, @RequestBody UserUpdate body) {
        if (body == null || blank(body.firstName()) || blank(body.lastName()) || blank(body.email())
                || body.firstName().trim().length() > 50 || body.lastName().trim().length() > 50
                || !EMAIL.matcher(body.email().trim()).matches()) {
            return Mono.just(error(HttpStatus.BAD_REQUEST, "Prénom, nom (50 caractères maximum) et e-mail valide obligatoires."));
        }
        Map<String, Object> changes = new HashMap<>();
        changes.put("firstName", body.firstName().trim());
        changes.put("lastName", body.lastName().trim());
        changes.put("email", body.email().trim().toLowerCase(Locale.ROOT));
        return keycloak.updateUser(id, changes)
                .thenReturn(ResponseEntity.ok(Map.<String, Object>of("message", "Utilisateur modifié")))
                .onErrorResume(KeycloakException.class, e -> Mono.just(error(e.status(), e.getMessage())));
    }

    @PutMapping("/users/{id}/enabled")
    public Mono<ResponseEntity<Map<String, Object>>> setEnabled(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
                                                                @RequestBody EnabledUpdate body) {
        if (body == null || body.enabled() == null) {
            return Mono.just(error(HttpStatus.BAD_REQUEST, "Champ « enabled » obligatoire."));
        }
        if (id.equals(jwt.getSubject()) && !body.enabled()) {
            return Mono.just(error(HttpStatus.CONFLICT, "Vous ne pouvez pas suspendre votre propre compte."));
        }
        Mono<Void> guard = body.enabled() ? Mono.empty() : ensureNotLastAdmin(id);
        return guard.then(keycloak.updateUser(id, Map.of("enabled", body.enabled())))
                .thenReturn(ResponseEntity.ok(Map.<String, Object>of("message",
                        body.enabled() ? "Compte réactivé" : "Compte suspendu")))
                .onErrorResume(KeycloakException.class, e -> Mono.just(error(e.status(), e.getMessage())));
    }

    @PutMapping("/users/{id}/role")
    public Mono<ResponseEntity<Map<String, Object>>> setRole(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
                                                             @RequestBody RoleUpdate body) {
        String role = body == null || body.role() == null ? "" : body.role().trim().toUpperCase(Locale.ROOT);
        if (!BUSINESS_ROLES.contains(role)) {
            return Mono.just(error(HttpStatus.BAD_REQUEST, "Rôle invalide (PARENT, BABYSITTER ou ADMIN)."));
        }
        if (id.equals(jwt.getSubject()) && !"ADMIN".equals(role)) {
            return Mono.just(error(HttpStatus.CONFLICT, "Vous ne pouvez pas retirer votre propre rôle administrateur."));
        }
        Mono<Void> guard = "ADMIN".equals(role) ? Mono.empty() : ensureNotLastAdmin(id);
        return guard.then(keycloak.realmRolesOf(id))
                .flatMap(current -> Flux.fromIterable(current)
                        .filter(r -> BUSINESS_ROLES.contains(r) && !r.equals(role))
                        .concatMap(r -> keycloak.removeRealmRole(id, r))
                        .then(current.contains(role) ? Mono.empty() : keycloak.addRealmRole(id, role))
                        .then(current.contains("USER") ? Mono.empty() : keycloak.addRealmRole(id, "USER")))
                .thenReturn(ResponseEntity.ok(Map.<String, Object>of("message", "Rôle mis à jour", "role", role)))
                .onErrorResume(KeycloakException.class, e -> Mono.just(error(e.status(), e.getMessage())));
    }

    @DeleteMapping("/users/{id}")
    public Mono<ResponseEntity<Map<String, Object>>> deleteUser(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        if (id.equals(jwt.getSubject())) {
            return Mono.just(error(HttpStatus.CONFLICT, "Vous ne pouvez pas supprimer votre propre compte."));
        }
        return ensureNotLastAdmin(id)
                .then(keycloak.getUser(id))
                .then(keycloak.deleteUser(id))
                .thenReturn(ResponseEntity.ok(Map.<String, Object>of("message", "Utilisateur supprimé")))
                .onErrorResume(KeycloakException.class, e -> Mono.just(error(e.status(), e.getMessage())));
    }

    /** Refuse l'opération si {@code userId} est le dernier administrateur actif. */
    private Mono<Void> ensureNotLastAdmin(String userId) {
        return keycloak.usersInRole("ADMIN", MAX_USERS_SCANNED).flatMap(admins -> {
            boolean isAdmin = admins.stream().anyMatch(a -> userId.equals(String.valueOf(a.get("id"))));
            long activeOthers = admins.stream()
                    .filter(a -> !userId.equals(String.valueOf(a.get("id"))))
                    .filter(a -> !Boolean.FALSE.equals(a.get("enabled")))
                    .count();
            if (isAdmin && activeOthers == 0) {
                return Mono.error(new KeycloakException(HttpStatus.CONFLICT,
                        "Impossible : c'est le dernier administrateur actif."));
            }
            return Mono.empty();
        });
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message, "status", status.value()));
    }
}
