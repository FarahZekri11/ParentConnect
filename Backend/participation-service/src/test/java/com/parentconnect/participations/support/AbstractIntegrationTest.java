package com.parentconnect.participations.support;

import com.github.tomakehurst.wiremock.WireMockServer;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;

/**
 * Base des tests d'intégration : PostgreSQL réel (Testcontainers) + Event Service simulé par WireMock
 * (permet de reproduire pannes, délais et réponses d'erreur).
 * Les deux sont démarrés une seule fois et partagés par tous les contextes Spring de test.
 */
// Pas de Config Server pendant les tests (la configuration de test est autonome)
@SpringBootTest(properties = "spring.cloud.config.enabled=false")
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withDatabaseName("participations_db")
                    .withUsername("participations_user")
                    .withPassword("participations_password");

    protected static final WireMockServer EVENT_SERVICE = new WireMockServer(wireMockConfig().dynamicPort());

    static {
        POSTGRES.start();
        EVENT_SERVICE.start();
        Runtime.getRuntime().addShutdownHook(new Thread(EVENT_SERVICE::stop));
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        // Clé publique du "realm Keycloak" de test (les tokens sont signés en RS256 par TestJwtFactory)
        registry.add("security.jwt.keycloak-public-key", TestJwtFactory::realmPublicKeyBase64);
        registry.add("clients.event-service.base-url", EVENT_SERVICE::baseUrl);
    }

    @BeforeEach
    void resetEventServiceStubs() {
        EVENT_SERVICE.resetAll();
    }
}
