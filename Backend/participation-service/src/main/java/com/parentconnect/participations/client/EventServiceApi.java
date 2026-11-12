package com.parentconnect.participations.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Map;
import java.util.UUID;

/**
 * Client déclaratif <b>OpenFeign</b> vers les endpoints internes d'Event Service.
 * <p>
 * Sans URL configurée ({@code clients.event-service.base-url} vide, cas Docker), l'instance est résolue
 * dynamiquement dans <b>Eureka</b> par son nom ({@code PARENTCONNECT-EVENT-SERVICE}) via Spring Cloud LoadBalancer.
 * Une URL explicite reste possible (tests WireMock, exécution hors annuaire).
 * <p>
 * Délais, en-têtes (clé interservices, jeton propagé) et traduction des erreurs : {@link EventServiceFeignConfig}.
 * Nouvelles tentatives et 503 : {@link EventServiceClient}.
 */
@FeignClient(
        name = "${clients.event-service.service-id:PARENTCONNECT-EVENT-SERVICE}",
        contextId = "eventServiceApi",
        url = "${clients.event-service.base-url:}",
        configuration = EventServiceFeignConfig.class)
public interface EventServiceApi {

    @GetMapping("/internal/events/{eventId}")
    EventSnapshot getEvent(@PathVariable("eventId") UUID eventId);

    @PostMapping(value = "/internal/events/{eventId}/reservations", consumes = MediaType.APPLICATION_JSON_VALUE)
    SeatReservationResult reserveSeat(@PathVariable("eventId") UUID eventId, @RequestBody Map<String, Object> body);

    @PostMapping(value = "/internal/events/{eventId}/reservations/release", consumes = MediaType.APPLICATION_JSON_VALUE)
    SeatReleaseResult releaseSeat(@PathVariable("eventId") UUID eventId, @RequestBody Map<String, Object> body);

    @GetMapping("/internal/reservations/active")
    ActiveSeatReservation[] listActiveReservations(@RequestParam("idleForSeconds") int idleForSeconds,
                                                   @RequestParam("limit") int limit,
                                                   @RequestParam(value = "afterId", required = false) UUID afterId);
}
