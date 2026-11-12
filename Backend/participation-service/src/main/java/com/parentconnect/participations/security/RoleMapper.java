package com.parentconnect.participations.security;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Normalisation des rôles provenant de Keycloak ({@code realm_access.roles}) ou de l'API Gateway
 * ({@code X-User-Role}) vers les autorités Spring {@code ROLE_PARENT}, {@code ROLE_PROFESSIONNEL}, {@code ROLE_ADMIN}.
 * <p>
 * Casse ignorée, préfixe {@code ROLE_} toléré, {@code PROFESSIONAL} (Keycloak) = {@code PROFESSIONNEL}.
 * Les rôles techniques de Keycloak (offline_access, uma_authorization, default-roles-...) sont ignorés.
 */
public final class RoleMapper {

    private static final Map<String, String> ALIASES = Map.of(
            "PARENT", Roles.PARENT,
            "PROFESSIONNEL", Roles.PROFESSIONNEL,
            "PROFESSIONAL", Roles.PROFESSIONNEL,
            "ADMIN", Roles.ADMIN);

    private RoleMapper() {
    }

    public static Set<GrantedAuthority> toAuthorities(Collection<String> rawRoles) {
        Set<GrantedAuthority> authorities = new LinkedHashSet<>();
        for (String raw : rawRoles) {
            if (raw == null) {
                continue;
            }
            String role = raw.trim().toUpperCase(Locale.ROOT);
            if (role.startsWith("ROLE_")) {
                role = role.substring(5);
            }
            String mapped = ALIASES.get(role);
            if (mapped != null) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + mapped));
            }
        }
        return authorities;
    }

    /** Ajoute à {@code target} les rôles contenus dans une valeur de claim (liste ou chaîne séparée par , ou espaces). */
    public static void collect(Object claim, Collection<String> target) {
        if (claim instanceof Collection<?> collection) {
            collection.stream().filter(Objects::nonNull).map(Object::toString).forEach(target::add);
        } else if (claim instanceof String value && !value.isBlank()) {
            for (String part : value.split("[,\\s]+")) {
                if (!part.isBlank()) {
                    target.add(part);
                }
            }
        }
    }
}
