package com.parentconnect.gateway.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Filtre Global de l'API Gateway:
 * 1. Supprime tout en-tête client non fiable (X-Gateway-Auth, X-User-Id, X-User-Role...) pour bloquer l'usurpation d'identité (Spoofing).
 * 2. Si l'utilisateur est authentifié avec succès via son JWT Keycloak, injecte les identités et rôles certifiés vers les microservices avals.
 */
@Component
public class HeaderSanitizationAndPropagationFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(HeaderSanitizationAndPropagationFilter.class);

    @Override
    public int getOrder() {
        // Exécuté après l'authentification Spring Security et avant le routage aval
        return Ordered.LOWEST_PRECEDENCE - 10;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        // 1. Élimination des en-têtes d'identité fournis par le client pour éviter le spoofing
        ServerHttpRequest.Builder requestBuilder = exchange.getRequest().mutate()
                .headers(httpHeaders -> {
                    httpHeaders.remove("X-Gateway-Auth");
                    httpHeaders.remove("X-User-Id");
                    httpHeaders.remove("X-User-Role");
                    httpHeaders.remove("X-User-Roles");
                    httpHeaders.remove("X-User-Email");
                    httpHeaders.remove("X-User-Name");
                    httpHeaders.remove("X-User-Sub");
                });

        // 2. Si authentifié via Keycloak JWT, injection des en-têtes de confiance vérifiés
        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .filter(Authentication::isAuthenticated)
                .map(Authentication::getPrincipal)
                .filter(principal -> principal instanceof Jwt)
                .map(principal -> (Jwt) principal)
                .map(jwt -> {
                    String userId = jwt.getSubject();
                    String username = jwt.getClaimAsString("preferred_username");
                    String email = jwt.getClaimAsString("email");

                    Map<String, Object> realmAccess = jwt.getClaim("realm_access");
                    String rolesStr = "USER";
                    if (realmAccess != null && realmAccess.containsKey("roles")) {
                        Object rolesObj = realmAccess.get("roles");
                        if (rolesObj instanceof Collection) {
                            Collection<?> roles = (Collection<?>) rolesObj;
                            rolesStr = roles.stream().map(Object::toString).collect(Collectors.joining(","));
                        }
                    }

                    log.debug("[Gateway] Injecting verified headers for user: {} (roles: {})", userId, rolesStr);

                    requestBuilder
                            .header("X-Gateway-Auth", "verified")
                            .header("X-User-Id", userId != null ? userId : "")
                            .header("X-User-Role", rolesStr)
                            .header("X-User-Roles", rolesStr)
                            .header("X-User-Email", email != null ? email : "")
                            .header("X-User-Name", username != null ? username : "");

                    return exchange.mutate().request(requestBuilder.build()).build();
                })
                .defaultIfEmpty(exchange.mutate().request(requestBuilder.build()).build())
                .flatMap(chain::filter);
    }
}
