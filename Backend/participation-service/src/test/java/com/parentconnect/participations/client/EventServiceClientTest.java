package com.parentconnect.participations.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.github.tomakehurst.wiremock.http.Fault;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.parentconnect.participations.exception.BusinessConflictException;
import com.parentconnect.participations.exception.ResourceNotFoundException;
import com.parentconnect.participations.exception.ServiceUnavailableException;
import com.parentconnect.participations.support.EventServiceStubs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Comportement réseau du client : délais, nouvelles tentatives, traduction des erreurs.
 */
class EventServiceClientTest {

    static final WireMockServer WM = new WireMockServer(wireMockConfig().dynamicPort());

    @BeforeAll
    static void startServer() {
        WM.start();
    }

    @AfterAll
    static void stopServer() {
        WM.stop();
    }

    private final UUID eventId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private EventServiceClient client;

    @BeforeEach
    void setUp() {
        WM.resetAll();
        var properties = new EventServiceProperties(WM.baseUrl(), "test-internal-key", Duration.ofMillis(500),
                Duration.ofMillis(500), 3, Duration.ofMillis(10));
        RestClient restClient = new EventServiceClientConfig().eventServiceRestClient(RestClient.builder(), properties);
        client = new EventServiceClient(restClient, properties, new ObjectMapper().registerModule(new JavaTimeModule()));
    }

    @Test
    void getEvent_sendsInternalKeyAndParsesSnapshot() {
        UUID organizer = UUID.randomUUID();
        EventServiceStubs.stubSnapshot(WM, eventId, organizer, "PUBLISHED", 10, 4);

        EventSnapshot snapshot = client.getEvent(eventId);

        assertThat(snapshot.organizerId()).isEqualTo(organizer);
        assertThat(snapshot.availablePlaces()).isEqualTo(6);
        WM.verify(getRequestedFor(urlPathEqualTo("/internal/events/" + eventId))
                .withHeader("X-Internal-Api-Key", equalTo("test-internal-key")));
    }

    @Test
    void transientErrors_areRetriedThenSucceed() {
        UUID operation = UUID.randomUUID();
        String path = "/internal/events/" + eventId + "/reservations";
        WM.stubFor(post(urlPathEqualTo(path)).inScenario("retry").whenScenarioStateIs(STARTED)
                .willReturn(aResponse().withStatus(503)).willSetStateTo("second"));
        WM.stubFor(post(urlPathEqualTo(path)).inScenario("retry").whenScenarioStateIs("second")
                .willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)).willSetStateTo("third"));
        WM.stubFor(post(urlPathEqualTo(path)).inScenario("retry").whenScenarioStateIs("third")
                .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                        .withBody(EventServiceStubs.reservationJson(eventId, userId, operation, false))));

        SeatReservationResult result = client.reserveSeat(eventId, userId, operation);

        assertThat(result.operationId()).isEqualTo(operation);
        // Les 3 tentatives portent le même operationId : la réservation reste idempotente
        WM.verify(3, postRequestedFor(urlPathEqualTo(path))
                .withRequestBody(equalToJson("{\"userId\":\"%s\",\"operationId\":\"%s\"}".formatted(userId, operation))));
    }

    @Test
    void timeouts_endWith503AfterMaxAttempts() {
        WM.stubFor(get(urlPathEqualTo("/internal/events/" + eventId))
                .willReturn(aResponse().withStatus(200).withFixedDelay(1500)));

        assertThatThrownBy(() -> client.getEvent(eventId)).isInstanceOf(ServiceUnavailableException.class);
        WM.verify(3, getRequestedFor(urlPathEqualTo("/internal/events/" + eventId)));
    }

    @Test
    void conflict_isTranslatedWithBusinessMessage_withoutRetry() {
        WM.stubFor(post(urlPathEqualTo("/internal/events/" + eventId + "/reservations"))
                .willReturn(aResponse().withStatus(409).withHeader("Content-Type", "application/json")
                        .withBody(EventServiceStubs.error(409, "L'événement est complet"))));

        assertThatThrownBy(() -> client.reserveSeat(eventId, userId, UUID.randomUUID()))
                .isInstanceOf(BusinessConflictException.class)
                .hasMessage("L'événement est complet");
        WM.verify(1, postRequestedFor(urlPathEqualTo("/internal/events/" + eventId + "/reservations")));
    }

    @Test
    void notFound_isTranslated() {
        WM.stubFor(get(urlPathEqualTo("/internal/events/" + eventId))
                .willReturn(aResponse().withStatus(404).withHeader("Content-Type", "application/json")
                        .withBody(EventServiceStubs.error(404, "Événement introuvable : " + eventId))));

        assertThatThrownBy(() -> client.getEvent(eventId)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void unauthorized_isAConfigurationError_notRetried() {
        WM.stubFor(get(urlPathEqualTo("/internal/events/" + eventId)).willReturn(aResponse().withStatus(401)));

        assertThatThrownBy(() -> client.getEvent(eventId)).isInstanceOf(ServiceUnavailableException.class);
        WM.verify(1, getRequestedFor(urlPathEqualTo("/internal/events/" + eventId)));
    }
}
