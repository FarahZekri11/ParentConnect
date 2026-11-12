package com.parentconnect.participations.controller;

import com.parentconnect.participations.repository.ParticipationRepository;
import com.parentconnect.participations.support.AbstractIntegrationTest;
import com.parentconnect.participations.support.EventServiceStubs;
import com.parentconnect.participations.support.TestJwtFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.absent;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contrat d'intégration ParentConnect : santé publique, JWT Keycloak RS256, mode relais API Gateway,
 * propagation du token vers Event Service.
 */
@AutoConfigureMockMvc
class IntegrationReadinessIT extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ParticipationRepository repository;

    private final UUID eventId = UUID.randomUUID();
    private final UUID organizerId = UUID.randomUUID();

    @BeforeEach
    void clean() {
        repository.deleteAll();
    }

    @Test
    void healthEndpointsArePublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("parentconnect-participation-service"));
        mockMvc.perform(get("/health")).andExpect(status().isOk());
    }

    @Test
    void join_propagatesUserTokenToEventService() throws Exception {
        EventServiceStubs.stubSnapshot(EVENT_SERVICE, eventId, organizerId, "PUBLISHED", 10, 0);
        EventServiceStubs.stubReserveEchoingOperation(EVENT_SERVICE, eventId);
        String bearer = TestJwtFactory.bearer(UUID.randomUUID(), "PARENT");

        mockMvc.perform(post("/api/events/{id}/join", eventId).header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isCreated());

        // Le token de l'utilisateur accompagne les appels vers Event Service, en plus de la clé interne
        EVENT_SERVICE.verify(getRequestedFor(urlPathEqualTo("/internal/events/" + eventId))
                .withHeader(HttpHeaders.AUTHORIZATION, equalTo(bearer))
                .withHeader("X-Internal-Api-Key", equalTo("test-internal-key")));
        EVENT_SERVICE.verify(postRequestedFor(urlPathEqualTo("/internal/events/" + eventId + "/reservations"))
                .withHeader(HttpHeaders.AUTHORIZATION, equalTo(bearer)));
    }

    @Test
    void gatewayRelay_joinWithPropagatedIdentity() throws Exception {
        EventServiceStubs.stubSnapshot(EVENT_SERVICE, eventId, organizerId, "PUBLISHED", 10, 0);
        EventServiceStubs.stubReserveEchoingOperation(EVENT_SERVICE, eventId);
        UUID userId = UUID.randomUUID();

        mockMvc.perform(post("/api/events/{id}/join", eventId)
                        .header("X-Gateway-Auth", "verified")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "PARENT"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(userId.toString()));

        // Pas de token reçu : rien à propager, la clé interne suffit
        EVENT_SERVICE.verify(getRequestedFor(urlPathEqualTo("/internal/events/" + eventId))
                .withHeader(HttpHeaders.AUTHORIZATION, absent()));

        mockMvc.perform(get("/api/events/me/joined")
                        .header("X-Gateway-Auth", "verified")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "PARENT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void roles_areEnforced_forKeycloakTokensAndGatewayRelay() throws Exception {
        // PROFESSIONAL (Keycloak) n'est pas autorisé à s'inscrire : 403
        mockMvc.perform(post("/api/events/{id}/join", eventId)
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(UUID.randomUUID(), "PROFESSIONAL")))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/events/{id}/join", eventId)
                        .header("X-Gateway-Auth", "verified")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "PROFESSIONAL"))
                .andExpect(status().isForbidden());
        // Identité Gateway incomplète : 401
        mockMvc.perform(post("/api/events/{id}/join", eventId)
                        .header("X-Gateway-Auth", "verified").header("X-User-Role", "PARENT"))
                .andExpect(status().isUnauthorized());
        // Token falsifié : 401
        mockMvc.perform(post("/api/events/{id}/join", eventId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + TestJwtFactory.forgedToken(UUID.randomUUID(), "PARENT")))
                .andExpect(status().isUnauthorized());
    }
}
