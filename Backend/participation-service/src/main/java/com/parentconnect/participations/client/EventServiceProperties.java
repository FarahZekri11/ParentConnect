package com.parentconnect.participations.client;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * Configuration du client REST vers Event Service.
 *
 * @param baseUrl        URL interne (dans Docker : http://event-service:8085, jamais localhost)
 * @param apiKey         clé interservices partagée (INTERNAL_API_KEY)
 * @param connectTimeout délai maximal d'établissement de connexion
 * @param readTimeout    délai maximal d'attente de réponse
 * @param maxAttempts    nombre total de tentatives pour les appels idempotents
 * @param initialBackoff attente avant la 2e tentative (doublée ensuite)
 */
@Validated
@ConfigurationProperties(prefix = "clients.event-service")
public record EventServiceProperties(
        @NotBlank String baseUrl,
        @NotBlank(message = "INTERNAL_API_KEY doit être défini") String apiKey,
        Duration connectTimeout,
        Duration readTimeout,
        @Min(1) Integer maxAttempts,
        Duration initialBackoff
) {
    public static final String API_KEY_HEADER = "X-Internal-Api-Key";

    public EventServiceProperties {
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(2) : connectTimeout;
        readTimeout = readTimeout == null ? Duration.ofSeconds(5) : readTimeout;
        maxAttempts = maxAttempts == null ? 3 : maxAttempts;
        initialBackoff = initialBackoff == null ? Duration.ofMillis(200) : initialBackoff;
    }
}
