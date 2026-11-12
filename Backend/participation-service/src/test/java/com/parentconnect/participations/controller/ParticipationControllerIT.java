package com.parentconnect.participations.controller;

import com.github.tomakehurst.wiremock.http.Fault;
import com.parentconnect.participations.entity.Participation;
import com.parentconnect.participations.entity.ParticipationStatus;
import com.parentconnect.participations.repository.ParticipationRepository;
import com.parentconnect.participations.support.AbstractIntegrationTest;
import com.parentconnect.participations.support.EventServiceStubs;
import com.parentconnect.participations.support.TestJwtFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests d'intégration : MockMvc + vrais JWT + PostgreSQL (Testcontainers) + Event Service simulé (WireMock).
 */
@AutoConfigureMockMvc
class ParticipationControllerIT extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ParticipationRepository repository;

    private final UUID eventId = UUID.randomUUID();
    private final UUID organizerId = UUID.randomUUID();
    private final UUID parentId = UUID.randomUUID();
    private String parentToken;

    @BeforeEach
    void setUp() {
        repository.deleteAll();
        parentToken = TestJwtFactory.bearer(parentId, "PARENT");
    }

    @Test
    void requiresAuthenticationAndParentRole() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/events/{id}/join", eventId))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/events/{id}/join", eventId)
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(UUID.randomUUID(), "PROFESSIONNEL")))
                .andExpect(status().isForbidden());
    }

    @Test
    void joinLeaveAndRejoin_fullFlow() throws Exception {
        EventServiceStubs.stubSnapshot(EVENT_SERVICE, eventId, organizerId, "PUBLISHED", 10, 0);
        EventServiceStubs.stubReserveEchoingOperation(EVENT_SERVICE, eventId);
        EventServiceStubs.stubReleaseOk(EVENT_SERVICE, eventId);

        join(parentToken)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.userId").value(parentId.toString()))
                .andExpect(jsonPath("$.eventId").value(eventId.toString()));

        // Double inscription
        join(parentToken)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Vous êtes déjà inscrit à cet événement"))
                .andExpect(jsonPath("$.path").value("/api/events/" + eventId + "/join"));

        Participation confirmed = repository.findByEventIdAndUserId(eventId, parentId).orElseThrow();

        // Désinscription : la place libérée est exactement celle réservée
        mockMvc.perform(delete("/api/events/{id}/leave", eventId).header(HttpHeaders.AUTHORIZATION, parentToken))
                .andExpect(status().isNoContent());
        EVENT_SERVICE.verify(postRequestedFor(urlPathEqualTo("/internal/events/" + eventId + "/reservations/release"))
                .withRequestBody(matchingJsonPath("$.operationId", com.github.tomakehurst.wiremock.client.WireMock
                        .equalTo(confirmed.getReservationOperationId().toString()))));
        assertThat(repository.findByEventIdAndUserId(eventId, parentId).orElseThrow().getStatus())
                .isEqualTo(ParticipationStatus.CANCELLED);

        // Seconde désinscription : rien à faire
        mockMvc.perform(delete("/api/events/{id}/leave", eventId).header(HttpHeaders.AUTHORIZATION, parentToken))
                .andExpect(status().isNotFound());

        // Réinscription : la même ligne est réactivée avec une nouvelle opération
        join(parentToken).andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CONFIRMED"));
        Participation reactivated = repository.findByEventIdAndUserId(eventId, parentId).orElseThrow();
        assertThat(reactivated.getId()).isEqualTo(confirmed.getId());
        assertThat(reactivated.getReservationOperationId()).isNotEqualTo(confirmed.getReservationOperationId());

        mockMvc.perform(get("/api/events/me/joined").header(HttpHeaders.AUTHORIZATION, parentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].status").value("CONFIRMED"));
    }

    @Test
    void join_conflictsFromEventService() throws Exception {
        EventServiceStubs.stubSnapshot(EVENT_SERVICE, eventId, organizerId, "PUBLISHED", 10, 10);
        join(parentToken).andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("L'événement est complet"));

        EventServiceStubs.stubSnapshot(EVENT_SERVICE, eventId, organizerId, "CANCELLED", 10, 0);
        join(parentToken).andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("L'événement a été annulé"));

        EventServiceStubs.stubSnapshot(EVENT_SERVICE, eventId, organizerId, "PUBLISHED", 10, 0);
        join(TestJwtFactory.bearer(organizerId, "PARENT"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Un organisateur ne peut pas s'inscrire à son propre événement"));

        // Dernière place prise entre la lecture et la réservation
        EVENT_SERVICE.stubFor(post(urlPathEqualTo("/internal/events/" + eventId + "/reservations"))
                .willReturn(aResponse().withStatus(409).withHeader("Content-Type", "application/json")
                        .withBody(EventServiceStubs.error(409, "L'événement est complet"))));
        join(parentToken).andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("L'événement est complet"));

        assertThat(repository.count()).isZero();
    }

    @Test
    void join_unknownEvent_returns404() throws Exception {
        join(parentToken).andExpect(status().isNotFound());
    }

    @Test
    void join_whenEventServiceDown_returns503AndCompensates() throws Exception {
        EventServiceStubs.stubSnapshot(EVENT_SERVICE, eventId, organizerId, "PUBLISHED", 10, 0);
        EVENT_SERVICE.stubFor(post(urlPathEqualTo("/internal/events/" + eventId + "/reservations"))
                .willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)));
        EventServiceStubs.stubReleaseOk(EVENT_SERVICE, eventId);

        join(parentToken)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value(503));

        assertThat(repository.count()).isZero();
        // 3 tentatives de réservation, puis compensation avec la même opération
        EVENT_SERVICE.verify(3, postRequestedFor(urlPathEqualTo("/internal/events/" + eventId + "/reservations")));
        EVENT_SERVICE.verify(1, postRequestedFor(urlPathEqualTo("/internal/events/" + eventId + "/reservations/release")));
    }

    @Test
    void participants_visibleOnlyToOrganizerOrAdmin() throws Exception {
        EventServiceStubs.stubSnapshot(EVENT_SERVICE, eventId, organizerId, "PUBLISHED", 10, 1);
        EventServiceStubs.stubReserveEchoingOperation(EVENT_SERVICE, eventId);
        join(parentToken).andExpect(status().isCreated());

        mockMvc.perform(get("/api/events/{id}/participants", eventId).header(HttpHeaders.AUTHORIZATION, parentToken))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/events/{id}/participants", eventId)
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(organizerId, "PARENT")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].userId").value(parentId.toString()));

        mockMvc.perform(get("/api/events/{id}/participants", eventId)
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(UUID.randomUUID(), "ADMIN")))
                .andExpect(status().isOk());
    }

    @Test
    void database_rejectsDuplicateParticipationForSameEventAndUser() {
        repository.saveAndFlush(Participation.builder().eventId(eventId).userId(parentId)
                .status(ParticipationStatus.CONFIRMED).joinedAt(LocalDateTime.now())
                .reservationOperationId(UUID.randomUUID()).build());

        assertThatThrownBy(() -> repository.saveAndFlush(Participation.builder().eventId(eventId).userId(parentId)
                .status(ParticipationStatus.CONFIRMED).joinedAt(LocalDateTime.now())
                .reservationOperationId(UUID.randomUUID()).build()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private org.springframework.test.web.servlet.ResultActions join(String token) throws Exception {
        return mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/api/events/{id}/join", eventId).header(HttpHeaders.AUTHORIZATION, token));
    }
}
