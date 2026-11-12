package com.parentconnect.participations.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

import java.util.Set;

/**
 * Décide si le JWT de l'en-tête Authorization doit être vérifié :
 * <ul>
 *   <li>non, si l'API Gateway a déjà vérifié l'identité ({@code X-Gateway-Auth: verified}) ;</li>
 *   <li>non, sur les endpoints interservices {@code /internal/**} (authentifiés par clé ; le token propagé
 *       par l'appelant y est simplement transmis) ;</li>
 *   <li>non, sur les endpoints de santé publics ;</li>
 *   <li>oui, dans tous les autres cas (mode direct).</li>
 * </ul>
 */
public class GatewayAwareBearerTokenResolver implements BearerTokenResolver {

    private static final Set<String> PUBLIC_PATHS = Set.of("/api/health", "/health");

    private final DefaultBearerTokenResolver delegate = new DefaultBearerTokenResolver();
    private final boolean gatewayRelayEnabled;

    public GatewayAwareBearerTokenResolver(boolean gatewayRelayEnabled) {
        this.gatewayRelayEnabled = gatewayRelayEnabled;
    }

    @Override
    public String resolve(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (path.startsWith("/internal/") || PUBLIC_PATHS.contains(path)) {
            return null;
        }
        if (gatewayRelayEnabled && GatewayRelayAuthenticationFilter.isGatewayVerified(request)) {
            return null;
        }
        return delegate.resolve(request);
    }
}
