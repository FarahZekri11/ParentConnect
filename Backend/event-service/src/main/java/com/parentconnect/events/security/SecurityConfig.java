package com.parentconnect.events.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    public static final String[] PUBLIC_DOC_PATHS = {
            "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs", "/v3/api-docs/**"
    };

    private final JwtUserAuthenticationConverter jwtConverter;
    private final JsonSecurityErrorHandlers errorHandlers;
    private final InternalApiProperties internalApiProperties;

    /** Mode relais API Gateway (X-Gateway-Auth: verified). */
    @Value("${security.gateway-relay.enabled:true}")
    private boolean gatewayRelayEnabled;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(PUBLIC_DOC_PATHS).permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        // Santé publique attendue par l'API Gateway / l'orchestrateur
                        .requestMatchers(HttpMethod.GET, "/api/health", "/health").permitAll()
                        // Endpoint de génération de JWT de démonstration : n'existe qu'avec le profil "dev"
                        .requestMatchers("/dev/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/internal/**").hasRole(Roles.INTERNAL_SERVICE)
                        // Création d'événements : réservée aux administrateurs ; les parents s'y inscrivent
                        .requestMatchers(HttpMethod.POST, "/api/events").hasRole(Roles.ADMIN)
                        .requestMatchers("/api/**").hasAnyRole(Roles.PARENT, Roles.PROFESSIONNEL, Roles.BABYSITTER, Roles.ADMIN)
                        .anyRequest().denyAll())
                .oauth2ResourceServer(oauth -> oauth
                        .bearerTokenResolver(new GatewayAwareBearerTokenResolver(gatewayRelayEnabled))
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter))
                        .authenticationEntryPoint(errorHandlers)
                        .accessDeniedHandler(errorHandlers))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(errorHandlers)
                        .accessDeniedHandler(errorHandlers))
                .addFilterBefore(new InternalApiKeyFilter(internalApiProperties), BearerTokenAuthenticationFilter.class);
        if (gatewayRelayEnabled) {
            http.addFilterBefore(new GatewayRelayAuthenticationFilter(), BearerTokenAuthenticationFilter.class);
        }
        return http.build();
    }
}
