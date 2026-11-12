package com.parentconnect.participations.client;

import com.parentconnect.participations.exception.ServiceUnavailableException;
import feign.FeignException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Appels de Participation Service vers Event Service, au-dessus du client <b>OpenFeign</b> {@link EventServiceApi}.
 * <ul>
 *     <li>délais de connexion et de lecture bornés (configuration Feign) ;</li>
 *     <li>nouvelles tentatives avec attente exponentielle sur erreurs réseau, 5xx et 429 ;
 *         sans risque car toutes les opérations sont idempotentes (lecture, ou operationId) ;</li>
 *     <li>traduction des erreurs : 404 → 404, 409 → 409 (message métier conservé), indisponibilité → 503.</li>
 * </ul>
 * La compensation (libération de place si l'inscription échoue) reste orchestrée par le service métier.
 */
@Slf4j
@Component
public class EventServiceClient {

    private final EventServiceApi api;
    private final EventServiceProperties properties;

    public EventServiceClient(EventServiceApi api, EventServiceProperties properties) {
        this.api = api;
        this.properties = properties;
    }

    public EventSnapshot getEvent(UUID eventId) {
        return withRetry("getEvent", () -> api.getEvent(eventId));
    }

    public SeatReservationResult reserveSeat(UUID eventId, UUID userId, UUID operationId) {
        return withRetry("reserveSeat", () -> api.reserveSeat(eventId, Map.of("userId", userId, "operationId", operationId)));
    }

    public SeatReleaseResult releaseSeat(UUID eventId, UUID userId, UUID operationId, Integer requireIdleSeconds) {
        Map<String, Object> body = new HashMap<>();
        body.put("userId", userId);
        body.put("operationId", operationId);
        if (requireIdleSeconds != null) {
            body.put("requireIdleSeconds", requireIdleSeconds);
        }
        return withRetry("releaseSeat", () -> api.releaseSeat(eventId, body));
    }

    public List<ActiveSeatReservation> listActiveReservations(int idleForSeconds, UUID afterId, int limit) {
        ActiveSeatReservation[] result = withRetry("listActiveReservations",
                () -> api.listActiveReservations(idleForSeconds, limit, afterId));
        return result == null ? List.of() : List.of(result);
    }

    private <T> T withRetry(String operation, Supplier<T> call) {
        int maxAttempts = properties.maxAttempts();
        long backoffMs = properties.initialBackoff().toMillis();
        for (int attempt = 1; ; attempt++) {
            try {
                return call.get();
            } catch (FeignException | RetryableEventServiceException ex) {
                // FeignException : erreur de transport (connexion refusée/réinitialisée, délai dépassé, réponse illisible)
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
