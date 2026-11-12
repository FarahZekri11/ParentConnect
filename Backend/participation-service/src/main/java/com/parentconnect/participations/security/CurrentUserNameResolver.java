package com.parentconnect.participations.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Nom affichable de l'utilisateur courant, utilisé uniquement pour l'affichage aux organisateurs.
 * <ul>
 *   <li>mode relais Gateway : en-tête {@code X-User-Display-Name} (encodé URL), injecté par la Gateway à partir du
 *       token vérifié (l'en-tête envoyé par un client est supprimé par la Gateway) ;</li>
 *   <li>mode JWT direct : claim {@code name}, sinon {@code preferred_username}.</li>
 * </ul>
 */
@Component
public class CurrentUserNameResolver {

    public static final String DISPLAY_NAME_HEADER = "X-User-Display-Name";
    private static final int MAX_LENGTH = 120;

    public String resolve(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String name = null;
        if (authentication instanceof GatewayAuthenticationToken) {
            String header = request.getHeader(DISPLAY_NAME_HEADER);
            if (header != null && !header.isBlank()) {
                try {
                    name = URLDecoder.decode(header, StandardCharsets.UTF_8);
                } catch (IllegalArgumentException ex) {
                    name = null;
                }
            }
        } else if (authentication instanceof JwtAuthenticationToken jwtAuth) {
            name = jwtAuth.getToken().getClaimAsString("name");
            if (name == null || name.isBlank()) {
                name = jwtAuth.getToken().getClaimAsString("preferred_username");
            }
        }
        if (name == null || name.isBlank()) {
            return null;
        }
        name = name.strip();
        return name.length() > MAX_LENGTH ? name.substring(0, MAX_LENGTH) : name;
    }
}
