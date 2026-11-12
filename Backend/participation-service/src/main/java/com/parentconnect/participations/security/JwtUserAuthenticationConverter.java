package com.parentconnect.participations.security;

import lombok.RequiredArgsConstructor;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Transforme un JWT Keycloak validé en authentification Spring :
 * <ul>
 *     <li>identifiant utilisateur = claim {@code sub} (repli : {@code preferred_username}), lu comme chaîne puis
 *         interprété comme UUID — format des identifiants Keycloak et des colonnes de mes bases ;</li>
 *     <li>rôles = {@code realm_access.roles} (ADMIN, PARENT, PROFESSIONAL/PROFESSIONNEL).</li>
 * </ul>
 * Un token sans identifiant UUID est rejeté (401). Un token sans rôle reconnu est authentifié sans rôle (403).
 */
@Component
@RequiredArgsConstructor
public class JwtUserAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final JwtProperties properties;

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        UUID userId = extractUserId(jwt);
        Set<GrantedAuthority> authorities = RoleMapper.toAuthorities(extractRoles(jwt.getClaims()));
        return new JwtAuthenticationToken(jwt, authorities, userId.toString());
    }

    private UUID extractUserId(Jwt jwt) {
        Set<String> candidates = new LinkedHashSet<>();
        addIfText(candidates, jwt.getClaims().get(properties.userIdClaim()));
        addIfText(candidates, jwt.getClaims().get("preferred_username"));
        addIfText(candidates, jwt.getClaims().get("userId"));
        if (candidates.isEmpty()) {
            throw new InvalidBearerTokenException("Le token ne contient pas d'identifiant utilisateur (sub)");
        }
        for (String candidate : candidates) {
            try {
                return UUID.fromString(candidate);
            } catch (IllegalArgumentException ignored) {
                // essayer le claim suivant
            }
        }
        throw new InvalidBearerTokenException("L'identifiant utilisateur du token doit être un UUID (sub Keycloak)");
    }

    private List<String> extractRoles(Map<String, Object> claims) {
        List<String> roles = new ArrayList<>();
        RoleMapper.collect(readPath(claims, properties.rolesClaimPath()), roles);
        // Compatibilité : claims plats "roles" / "role"
        RoleMapper.collect(claims.get("roles"), roles);
        RoleMapper.collect(claims.get("role"), roles);
        return roles;
    }

    private static Object readPath(Map<String, Object> claims, String path) {
        Object current = claims;
        for (String segment : path.split("\\.")) {
            if (!(current instanceof Map<?, ?> map)) {
                return null;
            }
            current = map.get(segment);
        }
        return current;
    }

    private static void addIfText(Set<String> target, Object value) {
        if (value != null && !value.toString().isBlank()) {
            target.add(value.toString().trim());
        }
    }
}
