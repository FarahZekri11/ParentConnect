package com.parentconnect.gateway.config;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import reactor.core.publisher.Flux;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Extracts Keycloak realm roles ("realm_access.roles") and maps them to Spring Security authorities:
 * - "USER"  -> "ROLE_USER"
 * - "ADMIN" -> "ROLE_ADMIN"
 */
public class KeycloakReactiveRoleConverter implements Converter<Jwt, Flux<GrantedAuthority>> {

    @Override
    @SuppressWarnings("unchecked")
    public Flux<GrantedAuthority> convert(Jwt jwt) {
        Map<String, Object> realmAccess = (Map<String, Object>) jwt.getClaims().get("realm_access");
        if (realmAccess == null || realmAccess.isEmpty()) {
            return Flux.empty();
        }

        Collection<String> roles = (Collection<String>) realmAccess.get("roles");
        if (roles == null || roles.isEmpty()) {
            return Flux.empty();
        }

        List<GrantedAuthority> authorities = roles.stream()
                .map(roleName -> "ROLE_" + roleName.toUpperCase())
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toList());

        return Flux.fromIterable(authorities);
    }
}
