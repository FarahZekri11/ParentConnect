package com.parentconnect.events.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
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

/**
 * Contrat d'intégration ParentConnect : santé publique, JWT Keycloak RS256, rôles realm_access,
 * mode relais API Gateway.
 */
@AutoConfigureMockMvc
class IntegrationReadinessIT extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private EventRepository eventRepository;
    @Autowired
    private SeatReservationRepository seatReservationRepository;

    @BeforeEach
    void clean() {
        seatReservationRepository.deleteAll();
        eventRepository.deleteAll();
    }

    @Test
    void healthEndpointsArePublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("parentconnect-event-service"));
        mockMvc.perform(get("/health")).andExpect(status().isOk());
        // Un token invalide n'empêche pas la consultation de la santé
        mockMvc.perform(get("/api/health").header(HttpHeaders.AUTHORIZATION, "Bearer invalide"))
                .andExpect(status().isOk());
    }

    @Test
    void keycloakRealmRoles_areMapped_includingProfessional() throws Exception {
        UUID professional = UUID.randomUUID();
        String body = objectMapper.writeValueAsString(
                EventFixtures.request(LocalDateTime.now().plusDays(3).withNano(0), 5));

        // Le rôle Keycloak PROFESSIONAL est reconnu (accès en lecture) ; la création reste réservée à l'ADMIN
        mockMvc.perform(get("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(professional, "PROFESSIONAL")))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(professional, "PROFESSIONAL"))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());

        // Rôles Keycloak en minuscules acceptés
        mockMvc.perform(get("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(UUID.randomUUID(), "parent")))
                .andExpect(status().isOk());
    }

    @Test
    void tokenWithoutBusinessRole_isForbidden_andNonUuidSubject_isUnauthorized() throws Exception {
        mockMvc.perform(get("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(UUID.randomUUID())))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + TestJwtFactory.tokenWithSubject("jdupont", "PARENT")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void gatewayRelay_trustsPropagatedIdentity() throws Exception {
        UUID userId = UUID.randomUUID();
        String body = objectMapper.writeValueAsString(
                EventFixtures.request(LocalDateTime.now().plusDays(3).withNano(0), 5));

        // Identité fournie par la Gateway : l'organisateur est X-User-Id ; le JWT n'est pas revérifié
        mockMvc.perform(post("/api/events")
                        .header("X-Gateway-Auth", "verified")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "ADMIN")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer token-deja-verifie-par-la-gateway")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.organizerId").value(userId.toString()));

        mockMvc.perform(get("/api/events/me/organized")
                        .header("X-Gateway-Auth", "verified")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "ROLE_ADMIN,offline_access"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void gatewayRelay_rejectsIncompleteIdentity() throws Exception {
        // Pas d'identifiant utilisateur -> 401
        mockMvc.perform(get("/api/events").header("X-Gateway-Auth", "verified").header("X-User-Role", "PARENT"))
                .andExpect(status().isUnauthorized());
        // Identifiant non UUID -> 401
        mockMvc.perform(get("/api/events").header("X-Gateway-Auth", "verified")
                        .header("X-User-Id", "jdupont").header("X-User-Role", "PARENT"))
                .andExpect(status().isUnauthorized());
        // Rôle insuffisant -> 403
        mockMvc.perform(get("/api/events").header("X-Gateway-Auth", "verified")
                        .header("X-User-Id", UUID.randomUUID().toString()).header("X-User-Role", "GUEST"))
                .andExpect(status().isForbidden());
        // En-tête Gateway absent ou différent de "verified" : identité propagée ignorée -> 401
        mockMvc.perform(get("/api/events").header("X-Gateway-Auth", "nope")
                        .header("X-User-Id", UUID.randomUUID().toString()).header("X-User-Role", "ADMIN"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void gatewayRelay_doesNotOpenInternalEndpoints() throws Exception {
        Event event = eventRepository.save(EventFixtures.event(UUID.randomUUID(), LocalDateTime.now().plusDays(2), 3, 0));
        mockMvc.perform(get("/internal/events/{id}", event.getId())
                        .header("X-Gateway-Auth", "verified")
                        .header("X-User-Id", UUID.randomUUID().toString()).header("X-User-Role", "ADMIN"))
                .andExpect(status().isUnauthorized());
    }
}
