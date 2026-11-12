package com.parentconnect.feign.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Intercepteur OpenFeign (Token Relay)
 * 
 * Extrait le JWT Keycloak du SecurityContext Spring Security et l'injecte
 * automatiquement dans l'en-tête HTTP 'Authorization: Bearer <token>'
 * de chaque appel inter-services sortant vers le microservice Marketplace.
 */
@Configuration
public class FeignKeycloakInterceptor implements RequestInterceptor {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_TOKEN_PREFIX = "Bearer ";

    @Override
    public void apply(RequestTemplate template) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication instanceof JwtAuthenticationToken jwtToken) {
            String tokenValue = jwtToken.getToken().getTokenValue();
            template.header(AUTHORIZATION_HEADER, BEARER_TOKEN_PREFIX + tokenValue);
        } else if (authentication != null && authentication.getCredentials() instanceof String credentials) {
            template.header(AUTHORIZATION_HEADER, BEARER_TOKEN_PREFIX + credentials);
        }
    }
}
