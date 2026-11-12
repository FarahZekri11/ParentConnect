package com.parentconnect.participations.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parentconnect.participations.exception.BusinessConflictException;
import com.parentconnect.participations.exception.ResourceNotFoundException;
import com.parentconnect.participations.exception.ServiceUnavailableException;
import feign.Feign;
import feign.Request;
import feign.RequestInterceptor;
import feign.Response;
import feign.Retryer;
import feign.codec.ErrorDecoder;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectFactory;
import org.springframework.boot.autoconfigure.http.HttpMessageConverters;
import org.springframework.cloud.openfeign.support.ResponseEntityDecoder;
import org.springframework.cloud.openfeign.support.SpringDecoder;
import org.springframework.cloud.openfeign.support.SpringEncoder;
import org.springframework.cloud.openfeign.support.SpringMvcContract;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.io.InputStream;
import java.util.concurrent.TimeUnit;

/**
 * Configuration propre au client Feign {@link EventServiceApi} (volontairement sans {@code @Configuration} :
 * elle ne s'applique qu'à ce client).
 * <ul>
 *   <li>délais de connexion et de lecture bornés ({@code clients.event-service.*}) ;</li>
 *   <li>en-tête {@code X-Internal-Api-Key} et propagation du jeton {@code Authorization} de la requête entrante ;</li>
 *   <li>pas de retry Feign : les nouvelles tentatives avec attente exponentielle sont gérées par
 *       {@link EventServiceClient} (opérations idempotentes) ;</li>
 *   <li>traduction des erreurs : 404 → 404, 409 → 409 (message métier conservé), 5xx/429 → nouvelle tentative,
 *       autres → 503.</li>
 * </ul>
 */
@Slf4j
public class EventServiceFeignConfig {

    @Bean
    Request.Options eventServiceRequestOptions(EventServiceProperties properties) {
        return options(properties);
    }

    @Bean
    Retryer eventServiceRetryer() {
        return Retryer.NEVER_RETRY;
    }

    @Bean
    ErrorDecoder eventServiceErrorDecoder(ObjectMapper objectMapper) {
        return new EventServiceErrorDecoder(objectMapper);
    }

    @Bean
    RequestInterceptor eventServiceHeaders(EventServiceProperties properties) {
        return headers(properties);
    }

    static Request.Options options(EventServiceProperties properties) {
        return new Request.Options(properties.connectTimeout().toMillis(), TimeUnit.MILLISECONDS,
                properties.readTimeout().toMillis(), TimeUnit.MILLISECONDS, true);
    }

    /** Clé interservices + jeton de l'utilisateur (absent hors requête HTTP, ex. tâche de réconciliation). */
    static RequestInterceptor headers(EventServiceProperties properties) {
        return template -> {
            template.header(EventServiceProperties.API_KEY_HEADER, properties.apiKey());
            if (!template.headers().containsKey(HttpHeaders.AUTHORIZATION)
                    && RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
                HttpServletRequest incoming = attributes.getRequest();
                String authorization = incoming.getHeader(HttpHeaders.AUTHORIZATION);
                if (authorization != null && !authorization.isBlank()) {
                    template.header(HttpHeaders.AUTHORIZATION, authorization);
                }
            }
        };
    }

    /**
     * Construction hors contexte Spring (tests unitaires) avec exactement la même configuration :
     * contrat Spring MVC, (dé)sérialisation Jackson, délais, en-têtes et décodeur d'erreurs.
     */
    public static EventServiceApi build(EventServiceProperties properties, ObjectMapper objectMapper) {
        ObjectFactory<HttpMessageConverters> converters =
                () -> new HttpMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper));
        return Feign.builder()
                .contract(new SpringMvcContract())
                .encoder(new SpringEncoder(converters))
                .decoder(new ResponseEntityDecoder(new SpringDecoder(converters)))
                .errorDecoder(new EventServiceErrorDecoder(objectMapper))
                .requestInterceptor(headers(properties))
                .options(options(properties))
                .retryer(Retryer.NEVER_RETRY)
                .target(EventServiceApi.class, properties.baseUrl());
    }

    /** Traduction des réponses d'erreur d'Event Service en exceptions métier. */
    static class EventServiceErrorDecoder implements ErrorDecoder {

        private final ObjectMapper objectMapper;

        EventServiceErrorDecoder(ObjectMapper objectMapper) {
            this.objectMapper = objectMapper;
        }

        @Override
        public Exception decode(String methodKey, Response response) {
            int status = response.status();
            String message = extractMessage(response);
            if (status == 404) {
                return new ResourceNotFoundException(message != null ? message : "Événement introuvable");
            }
            if (status == 409) {
                return new BusinessConflictException(message != null ? message : "Conflit avec l'état de l'événement");
            }
            if (status >= 500 || status == 429) {
                return new EventServiceClient.RetryableEventServiceException("HTTP " + status);
            }
            // 400/401/403 : erreur de configuration ou d'intégration, inutile de réessayer
            log.error("Réponse inattendue d'Event Service ({}) : HTTP {} ({})", methodKey, status, message);
            return new ServiceUnavailableException("Le service des événements a refusé la requête");
        }

        private String extractMessage(Response response) {
            if (response.body() == null) {
                return null;
            }
            try (InputStream body = response.body().asInputStream()) {
                byte[] bytes = body.readAllBytes();
                if (bytes.length == 0) {
                    return null;
                }
                JsonNode node = objectMapper.readTree(bytes);
                return node.hasNonNull("message") ? node.get("message").asText() : null;
            } catch (Exception ex) {
                return null;
            }
        }
    }
}
