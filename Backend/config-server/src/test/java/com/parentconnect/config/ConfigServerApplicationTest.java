package com.parentconnect.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Le Config Server sert réellement les fichiers du dépôt Backend/config-repo (lu depuis les sources du projet).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.cloud.config.server.native.search-locations=file:../config-repo",
        "eureka.client.enabled=false"
})
class ConfigServerApplicationTest {

    @Autowired
    TestRestTemplate rest;

    @Test
    @SuppressWarnings("unchecked")
    void servesParticipationConfigurationFromTheRepository() {
        Map<String, Object> body = rest.getForObject("/parentconnect-participation-service/default", Map.class);

        assertThat(body).containsEntry("name", "parentconnect-participation-service");
        List<Map<String, Object>> sources = (List<Map<String, Object>>) body.get("propertySources");
        // Fichier propre au service + fichier commun application.yml
        assertThat(sources).extracting(s -> String.valueOf(s.get("name")))
                .anyMatch(n -> n.endsWith("parentconnect-participation-service.yml"))
                .anyMatch(n -> n.endsWith("application.yml"));
        Map<String, Object> own = (Map<String, Object>) sources.get(0).get("source");
        assertThat(own).containsKey("clients.event-service.max-attempts");
    }

    @Test
    void unknownApplicationStillGetsSharedConfiguration() {
        Map<?, ?> body = rest.getForObject("/inconnu/default", Map.class);
        assertThat((List<?>) body.get("propertySources")).isNotEmpty();
    }
}
