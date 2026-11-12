package com.parentconnect.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverterAdapter;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;
import reactor.core.publisher.Mono;

import java.util.Collection;
import java.util.Collections;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Sécurisation de l'API Gateway avec Keycloak (Spring Cloud Gateway WebFlux Reactive Security)
 */
@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http) {
        http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .cors(ServerHttpSecurity.CorsSpec::disable)
            .authorizeExchange(exchanges -> exchanges
                // Public CORS preflight requests
                .pathMatchers(HttpMethod.OPTIONS).permitAll()
                // Inscription d'un nouveau parent (création du compte Keycloak par la Gateway)
                .pathMatchers(HttpMethod.POST, "/api/auth/register").permitAll()

                // Public Actuator, Eureka, and health check endpoints
                .pathMatchers("/actuator/health", "/actuator/health/**", "/actuator/info", "/eureka/**",
                        "/health", "/api/health").permitAll()

                // Documentation OpenAPI centralisée (Swagger UI de la Gateway + documents de chaque service)
                .pathMatchers(HttpMethod.GET, "/swagger-ui.html", "/swagger-ui/**", "/webjars/**",
                        "/v3/api-docs", "/v3/api-docs/**", "/docs/**").permitAll()

                // Endpoints interservices : bloqués par la route "block-internal" (404)
                .pathMatchers("/internal/**", "/api/internal/**").permitAll()

                // Consultation publique (règles reprises des SERVICE_CARD des services)
                .pathMatchers(HttpMethod.GET, "/api/listings", "/api/listings/**").permitAll()
                .pathMatchers(HttpMethod.GET, "/api/posts", "/api/posts/**").permitAll()
                .pathMatchers(HttpMethod.GET, "/api/comments/**").permitAll()
                .pathMatchers(HttpMethod.GET, "/api/categories", "/api/categories/**").permitAll()

                // WebSocket de la messagerie : le navigateur ne peut pas envoyer d'en-tête Authorization,
                // l'authentification est faite par le service Messaging
                .pathMatchers("/ws").permitAll()

                // Administration : rôle ADMIN obligatoire dès la Gateway
                .pathMatchers("/api/admin/**").hasRole("ADMIN")

                // Tout le reste : JWT Keycloak valide obligatoire (les rôles fins sont vérifiés par chaque service)
                .anyExchange().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(grantedAuthoritiesExtractor()))
            );

        return http.build();
    }

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.addAllowedOriginPattern("*");
        config.addAllowedMethod("*");
        config.addAllowedHeader("*");
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsWebFilter(source);
    }

    @SuppressWarnings("unchecked")
    private Converter<Jwt, Mono<AbstractAuthenticationToken>> grantedAuthoritiesExtractor() {
        JwtAuthenticationConverter jwtAuthenticationConverter = new JwtAuthenticationConverter();
        jwtAuthenticationConverter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Map<String, Object> realmAccess = (Map<String, Object>) jwt.getClaims().get("realm_access");
            if (realmAccess == null || realmAccess.isEmpty()) {
                return Collections.emptyList();
            }
            Collection<String> roles = (Collection<String>) realmAccess.get("roles");
            if (roles == null || roles.isEmpty()) {
                return Collections.emptyList();
            }
            return roles.stream()
                    .map(roleName -> new SimpleGrantedAuthority("ROLE_" + roleName.toUpperCase()))
                    .collect(Collectors.toList());
        });
        return new ReactiveJwtAuthenticationConverterAdapter(jwtAuthenticationConverter);
    }
}
