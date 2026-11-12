package com.parentconnect.participations.support;

import com.github.tomakehurst.wiremock.WireMockServer;

import java.time.LocalDateTime;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;

/**
 * Réponses simulées des endpoints internes d'Event Service.
 */
public final class EventServiceStubs {

    private EventServiceStubs() {
    }

    public static String snapshotJson(UUID eventId, UUID organizerId, String status, int capacity, int reserved,
                                      LocalDateTime start) {
        return """
                {"id":"%s","title":"Atelier peinture","organizerId":"%s","status":"%s",
                 "startDateTime":"%s","endDateTime":"%s","capacity":%d,"reservedPlaces":%d,
                 "availablePlaces":%d,"openForRegistration":%s}
                """.formatted(eventId, organizerId, status, start, start.plusHours(2), capacity, reserved,
                capacity - reserved, "PUBLISHED".equals(status) && reserved < capacity);
    }

    public static void stubSnapshot(WireMockServer wm, UUID eventId, UUID organizerId, String status,
                                    int capacity, int reserved) {
        wm.stubFor(get(urlPathEqualTo("/internal/events/" + eventId))
                .withHeader("X-Internal-Api-Key", equalTo("test-internal-key"))
                .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                        .withBody(snapshotJson(eventId, organizerId, status, capacity, reserved,
                                LocalDateTime.now().plusDays(3).withNano(0)))));
    }

    public static void stubReserveOk(WireMockServer wm, UUID eventId, UUID userId, UUID holderOperation,
                                     boolean alreadyHeld) {
        wm.stubFor(post(urlPathEqualTo("/internal/events/" + eventId + "/reservations"))
                .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                        .withBody(reservationJson(eventId, userId, holderOperation, alreadyHeld))));
    }

    /** La réponse renvoie l'operationId reçu (comportement réel d'Event Service pour une nouvelle place). */
    public static void stubReserveEchoingOperation(WireMockServer wm, UUID eventId) {
        wm.stubFor(post(urlPathEqualTo("/internal/events/" + eventId + "/reservations"))
                .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                        .withTransformers("response-template")
                        .withBody("""
                                {"eventId":"%s","userId":"{{jsonPath request.body '$.userId'}}",
                                 "operationId":"{{jsonPath request.body '$.operationId'}}","status":"ACTIVE",
                                 "alreadyHeld":false,"reservedPlaces":1,"availablePlaces":9}
                                """.formatted(eventId))));
    }

    public static void stubReleaseOk(WireMockServer wm, UUID eventId) {
        wm.stubFor(post(urlPathEqualTo("/internal/events/" + eventId + "/reservations/release"))
                .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                        .withBody("""
                                {"eventId":"%s","userId":"%s","released":true,"outcome":"RELEASED",
                                 "reservedPlaces":0,"availablePlaces":10}
                                """.formatted(eventId, UUID.randomUUID()))));
    }

    public static String reservationJson(UUID eventId, UUID userId, UUID operationId, boolean alreadyHeld) {
        return """
                {"eventId":"%s","userId":"%s","operationId":"%s","status":"ACTIVE","alreadyHeld":%s,
                 "reservedPlaces":1,"availablePlaces":9}
                """.formatted(eventId, userId, operationId, alreadyHeld);
    }

    public static String error(int status, String message) {
        return """
                {"timestamp":"2026-10-29T15:00:00","status":%d,"error":"Error","message":"%s","path":"/internal"}
                """.formatted(status, message);
    }
}
