package com.parentconnect.events.security;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Clé partagée authentifiant les appels interservices (en-tête X-Internal-Api-Key).
 */
@Validated
@ConfigurationProperties(prefix = "security.internal")
public record InternalApiProperties(
        @NotBlank(message = "INTERNAL_API_KEY doit être défini") String apiKey
) {
    public static final String HEADER = "X-Internal-Api-Key";
}
