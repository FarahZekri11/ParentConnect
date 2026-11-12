package com.parentconnect.events.config;

import com.parentconnect.events.security.InternalApiProperties;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    public static final String BEARER_SCHEME = "bearerAuth";
    public static final String INTERNAL_SCHEME = "internalApiKey";

    @Bean
    public OpenAPI eventServiceOpenApi(@Value("${app.public-url:http://localhost:8085}") String publicUrl) {
        return new OpenAPI()
                .info(new Info()
                        .title("ParentConnect - Event Service API")
                        .version("1.0.0")
                        .description("""
                                Gestion des événements ParentConnect (création, modification, annulation, recherche).

                                **Authentification** : cliquez sur *Authorize* et collez un JWT Keycloak (realm parentconnect)
                                (ou, en profil `dev`, un token obtenu via `GET /dev/tokens`).

                                Les endpoints `/internal/**` sont réservés à Participation Service (en-tête `X-Internal-Api-Key`).
                                """)
                        .contact(new Contact().name("ParentConnect")))
                .servers(List.of(new Server().url(publicUrl).description("Event Service")))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("JWT RS256 émis par Keycloak (realm parentconnect)"))
                        .addSecuritySchemes(INTERNAL_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name(InternalApiProperties.HEADER)
                                .description("Clé partagée des appels interservices")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME));
    }

    @Bean
    public GroupedOpenApi publicApi() {
        return GroupedOpenApi.builder().group("1-public").displayName("API publique").pathsToMatch("/api/**").build();
    }

    @Bean
    public GroupedOpenApi internalApi() {
        return GroupedOpenApi.builder().group("2-internal").displayName("API interne").pathsToMatch("/internal/**").build();
    }

    @Bean
    public GroupedOpenApi devApi() {
        return GroupedOpenApi.builder().group("3-dev").displayName("Outils de développement").pathsToMatch("/dev/**").build();
    }
}
