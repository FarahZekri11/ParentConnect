package com.parentconnect.participations.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parentconnect.participations.exception.BusinessConflictException;
import com.parentconnect.participations.exception.ResourceNotFoundException;
import com.parentconnect.participations.exception.ServiceUnavailableException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Client REST vers les endpoints internes d'Event Service.
 * <ul>
 *     <li>délais de connexion et de lecture bornés ;</li>
 *     <li>nouvelles tentatives avec attente exponentielle sur erreurs réseau, 5xx et 429 ;
 *         sans risque car toutes les opérations sont idempotentes (lecture, ou operationId) ;</li>
 *     <li>traduction des erreurs : 404 → 404, 409 → 409 (message métier conservé), indisponibilité → 503.</li>
 * </ul>
 */
@Slf4j
@Component
public class EventServiceClient {

    private final RestClient restClient;
    private final EventServiceProperties properties;
    private final ObjectMapper objectMapper;

    public EventServiceClient(@Qualifier("eventServiceRestClient") RestClient restClient,
                              EventServiceProperties properties,
                              ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public EventSnapshot getEvent(UUID eventId) {
        return withRetry("getEvent", () -> restClient.get()
                .uri("/internal/events/{eventId}", eventId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(EventSnapshot.class));
    }

    public SeatReservationResult reserveSeat(UUID eventId, UUID userId, UUID operationId) {
        return withRetry("reserveSeat", () -> restClient.post()
                .uri("/internal/events/{eventId}/reservations", eventId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("userId", userId, "operationId", operationId))
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(SeatReservationResult.class));
    }

    public SeatReleaseResult releaseSeat(UUID eventId, UUID userId, UUID operationId, Integer requireIdleSeconds) {
        var body = new java.util.HashMap<String, Object>();
        body.put("userId", userId);
        body.put("operationId", operationId);
        if (requireIdleSeconds != null) {
            body.put("requireIdleSeconds", requireIdleSeconds);
        }
        return withRetry("releaseSeat", () -> restClient.post()
                .uri("/internal/events/{eventId}/reservations/release", eventId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(SeatReleaseResult.class));
    }

    public List<ActiveSeatReservation> listActiveReservations(int idleForSeconds, UUID afterId, int limit) {
        ActiveSeatReservation[] result = withRetry("listActiveReservations", () -> restClient.get()
                .uri(uri -> {
                    uri.path("/internal/reservations/active")
                            .queryParam("idleForSeconds", idleForSeconds)
                            .queryParam("limit", limit);
                    if (afterId != null) {
                        uri.queryParam("afterId", afterId);
                    }
                    return uri.build();
                })
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::translateError)
                .body(ActiveSeatReservation[].class));
        return result == null ? List.of() : List.of(result);
    }

    private <T> T withRetry(String operation, Supplier<T> call) {
        int maxAttempts = properties.maxAttempts();
        long backoffMs = properties.initialBackoff().toMillis();
        for (int attempt = 1; ; attempt++) {
            try {
                return call.get();
            } catch (RestClientException | RetryableEventServiceException ex) {
                // RestClientException : erreur de transport (connexion refusée/réinitialisée, délai dépassé...)
                if (attempt >= maxAttempts) {
                    log.error("Event Service indisponible ({}) après {} tentative(s) : {}", operation, attempt, ex.getMessage());
                    throw new ServiceUnavailableException(
                            "Le service des événements est momentanément indisponible, veuillez réessayer", ex);
                }
                log.warn("Échec de l'appel {} à Event Service (tentative {}/{}) : {}", operation, attempt,
                        maxAttempts, ex.getMessage());
                sleep(backoffMs);
                backoffMs = backoffMs * 2;
            }
        }
    }

    private void translateError(org.springframework.http.HttpRequest request, ClientHttpResponse response)
            throws IOException {
        HttpStatusCode status = response.getStatusCode();
        String message = extractMessage(response);
        if (status.value() == 404) {
            throw new ResourceNotFoundException(message != null ? message : "Événement introuvable");
        }
        if (status.value() == 409) {
            throw new BusinessConflictException(message != null ? message : "Conflit avec l'état de l'événement");
        }
        if (status.is5xxServerError() || status.value() == 429) {
            throw new RetryableEventServiceException("HTTP " + status.value());
        }
        // 400/401/403 : erreur de configuration ou d'intégration, inutile de réessayer
        log.error("Réponse inattendue d'Event Service {} {} : HTTP {} ({})", request.getMethod(), request.getURI(),
                status.value(), message);
        throw new ServiceUnavailableException("Le service des événements a refusé la requête");
    }

    private String extractMessage(ClientHttpResponse response) {
        try {
            byte[] bytes = response.getBody().readAllBytes();
            if (bytes.length == 0) {
                return null;
            }
            JsonNode node = objectMapper.readTree(bytes);
            return node.hasNonNull("message") ? node.get("message").asText() : null;
        } catch (IOException | RuntimeException ex) {
            return null;
        }
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ServiceUnavailableException("Appel à Event Service interrompu", ex);
        }
    }

    /** Erreur transitoire (5xx, 429) justifiant une nouvelle tentative. */
    static class RetryableEventServiceException extends RuntimeException {
        RetryableEventServiceException(String message) {
            super(message);
        }
    }
}
