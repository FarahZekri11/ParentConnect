package com.parentconnect.participations.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Mode relais API Gateway : si la requête porte {@code X-Gateway-Auth: verified}, l'identité propagée
 * ({@code X-User-Id}, {@code X-User-Role}) est utilisée sans revérifier la signature du JWT.
 * <p>
 * X-User-Id doit être un UUID (sub Keycloak) : sinon la requête reste anonyme (401).
 * Sans rôle reconnu, l'utilisateur est authentifié sans rôle (403 sur les endpoints protégés).
 * <b>Sécurité</b> : le port du service ne doit être accessible que via l'API Gateway
 * (désactivable avec {@code GATEWAY_RELAY_ENABLED=false}).
 */
public class GatewayRelayAuthenticationFilter extends OncePerRequestFilter {

    public static final String GATEWAY_AUTH_HEADER = "X-Gateway-Auth";
    public static final String GATEWAY_AUTH_VERIFIED = "verified";
    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String USER_ROLE_HEADER = "X-User-Role";

    public static boolean isGatewayVerified(HttpServletRequest request) {
        return GATEWAY_AUTH_VERIFIED.equalsIgnoreCase(trim(request.getHeader(GATEWAY_AUTH_HEADER)));
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Les endpoints interservices ne sont jamais exposés par la Gateway : clé interne uniquement
        return request.getRequestURI().startsWith(request.getContextPath() + "/internal/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (isGatewayVerified(request)) {
            String userId = trim(request.getHeader(USER_ID_HEADER));
            if (isUuid(userId)) {
                List<String> roles = new ArrayList<>();
                RoleMapper.collect(request.getHeader(USER_ROLE_HEADER), roles);
                SecurityContextHolder.getContext()
                        .setAuthentication(new GatewayAuthenticationToken(userId, RoleMapper.toAuthorities(roles)));
            }
        }
        chain.doFilter(request, response);
    }

    private static boolean isUuid(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }
}
