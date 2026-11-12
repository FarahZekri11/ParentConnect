package com.parentconnect.participations.config;

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

    @Bean
    public OpenAPI participationServiceOpenApi(@Value("${app.public-url:http://localhost:8086}") String publicUrl) {
        return new OpenAPI()
                .info(new Info()
                        .title("ParentConnect - Participation Service API")
                        .version("1.0.0")
                        .description("""
                                Inscriptions et désinscriptions aux événements ParentConnect.

                                **Authentification** : cliquez sur *Authorize* et collez un JWT Keycloak (realm parentconnect)
                                (ou, en profil `dev`, un token obtenu via `GET /dev/tokens`).

                                Les disponibilités et l'organisateur sont vérifiés auprès d'Event Service.
                                """)
                        .contact(new Contact().name("ParentConnect")))
                .servers(List.of(new Server().url(publicUrl).description("Participation Service")))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("JWT RS256 émis par Keycloak (realm parentconnect)")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME));
    }

    @Bean
    public GroupedOpenApi publicApi() {
        return GroupedOpenApi.builder().group("1-public").displayName("API publique").pathsToMatch("/api/**").build();
    }

    @Bean
    public GroupedOpenApi devApi() {
        return GroupedOpenApi.builder().group("3-dev").displayName("Outils de développement").pathsToMatch("/dev/**").build();
    }
}
