package com.parentconnect.events.controller;

import com.parentconnect.events.entity.Event;
import com.parentconnect.events.repository.EventRepository;
import com.parentconnect.events.repository.SeatReservationRepository;
import com.parentconnect.events.support.AbstractIntegrationTest;
import com.parentconnect.events.support.EventFixtures;
import com.parentconnect.events.support.TestJwtFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class InternalEventControllerIT extends AbstractIntegrationTest {

    private static final String KEY_HEADER = "X-Internal-Api-Key";
    private static final String KEY = "test-internal-key";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private EventRepository eventRepository;
    @Autowired
    private SeatReservationRepository seatReservationRepository;

    private Event event;

    @BeforeEach
    void setUp() {
        seatReservationRepository.deleteAll();
        eventRepository.deleteAll();
        event = eventRepository.save(EventFixtures.event(UUID.randomUUID(), LocalDateTime.now().plusDays(2), 1, 0));
    }

    @Test
    void internalEndpoints_requireInternalKey() throws Exception {
        mockMvc.perform(get("/internal/events/{id}", event.getId()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/internal/events/{id}", event.getId()).header(KEY_HEADER, "wrong"))
                .andExpect(status().isUnauthorized());
        // Un JWT utilisateur, même ADMIN, ne donne pas accès aux endpoints internes :
        // sur /internal/** le token propagé n'authentifie pas, seule la clé interne compte
        mockMvc.perform(get("/internal/events/{id}", event.getId())
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(UUID.randomUUID(), "ADMIN")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void snapshotReserveAndRelease_overHttp() throws Exception {
        UUID user = UUID.randomUUID();
        UUID operation = UUID.randomUUID();

        mockMvc.perform(get("/internal/events/{id}", event.getId()).header(KEY_HEADER, KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.organizerId").value(event.getOrganizerId().toString()))
                .andExpect(jsonPath("$.openForRegistration").value(true));

        String reservation = """
                {"userId":"%s","operationId":"%s"}""".formatted(user, operation);
        mockMvc.perform(post("/internal/events/{id}/reservations", event.getId())
                        .header(KEY_HEADER, KEY).contentType(MediaType.APPLICATION_JSON).content(reservation))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.availablePlaces").value(0));

        // Événement complet pour un autre utilisateur
        mockMvc.perform(post("/internal/events/{id}/reservations", event.getId())
                        .header(KEY_HEADER, KEY).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"userId":"%s","operationId":"%s"}""".formatted(UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("L'événement est complet"));

        mockMvc.perform(get("/internal/reservations/active?idleForSeconds=0").header(KEY_HEADER, KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].operationId").value(operation.toString()));

        mockMvc.perform(post("/internal/events/{id}/reservations/release", event.getId())
                        .header(KEY_HEADER, KEY).contentType(MediaType.APPLICATION_JSON).content(reservation))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.released").value(true))
                .andExpect(jsonPath("$.availablePlaces").value(1));
    }

    @Test
    void forwardedUserToken_doesNotPreventInternalKeyAuthentication() throws Exception {
        // Participation Service propage le token de l'utilisateur : l'appel reste authentifié par la clé interne
        mockMvc.perform(get("/internal/events/{id}", event.getId())
                        .header(KEY_HEADER, KEY)
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(UUID.randomUUID(), "PARENT")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/internal/events/{id}", event.getId())
                        .header(KEY_HEADER, KEY)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer expired-or-invalid"))
                .andExpect(status().isOk());
    }

    @Test
    void unknownEvent_returns404() throws Exception {
        mockMvc.perform(post("/internal/events/{id}/reservations", UUID.randomUUID())
                        .header(KEY_HEADER, KEY).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"userId":"%s","operationId":"%s"}""".formatted(UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isNotFound());
    }
}
