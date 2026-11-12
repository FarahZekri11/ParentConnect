package com.parentconnect.events.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parentconnect.events.dto.EventRequest;
import com.parentconnect.events.entity.EventCategory;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class EventControllerIT extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private EventRepository eventRepository;
    @Autowired
    private SeatReservationRepository seatReservationRepository;

    private final UUID organizerId = UUID.randomUUID();
    private String organizerToken;

    @BeforeEach
    void cleanDatabase() {
        seatReservationRepository.deleteAll();
        eventRepository.deleteAll();
        organizerToken = TestJwtFactory.bearer(organizerId, "PARENT");
    }

    @Test
    void endpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/events"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.path").value("/api/events"));
    }

    @Test
    void expiredOrForgedTokensAreRejected() throws Exception {
        mockMvc.perform(get("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + TestJwtFactory.expiredToken(organizerId, "PARENT")))
                .andExpect(status().isUnauthorized());

        String forged = TestJwtFactory.forgedToken(organizerId, "ADMIN");
        mockMvc.perform(get("/api/events").header(HttpHeaders.AUTHORIZATION, "Bearer " + forged))
                .andExpect(status().isUnauthorized());

        // Hors profil dev, un token HS256 (format de démonstration) est refusé
        String hs256 = TestJwtFactory.hs256Token("dev-only-insecure-secret-change-me-0123456789", organizerId, "ADMIN");
        mockMvc.perform(get("/api/events").header(HttpHeaders.AUTHORIZATION, "Bearer " + hs256))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void swaggerIsPublic() throws Exception {
        mockMvc.perform(get("/v3/api-docs/1-public")).andExpect(status().isOk());
        mockMvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
    }

    @Test
    void createEvent_returns201WithOrganizerFromToken() throws Exception {
        EventRequest request = EventFixtures.request(LocalDateTime.now().plusDays(3).withNano(0), 12);

        mockMvc.perform(post("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION, containsString("/api/events/")))
                .andExpect(jsonPath("$.organizerId").value(organizerId.toString()))
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.availablePlaces").value(12));
    }

    @Test
    void createEvent_withInvalidData_returns400() throws Exception {
        String body = """
                {"title":"","category":"SORTIE","startDateTime":"%s","endDateTime":"%s","city":"Lyon","capacity":0}
                """.formatted(LocalDateTime.now().plusDays(2).withNano(0), LocalDateTime.now().plusDays(2).plusHours(1).withNano(0));

        mockMvc.perform(post("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("capacity")))
                .andExpect(jsonPath("$.message", containsString("title")));
    }

    @Test
    void createEvent_withEndBeforeStart_returns400() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(2).withNano(0);
        var base = EventFixtures.request(start, 5);
        var invalid = new EventRequest(base.title(), null, base.category(), start, start.minusHours(1),
                null, null, "Lyon", null, null, 5, null, null);

        mockMvc.perform(post("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("date de fin")));
    }

    @Test
    void createEvent_inThePast_returns400() throws Exception {
        var request = EventFixtures.request(LocalDateTime.now().minusDays(1).withNano(0), 5);
        mockMvc.perform(post("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateAndCancel_respectOrganizerOwnership() throws Exception {
        UUID eventId = createEvent(EventFixtures.request(LocalDateTime.now().plusDays(4).withNano(0), 10));
        var update = EventFixtures.request(LocalDateTime.now().plusDays(5).withNano(0), 20);

        // Un autre parent ne peut ni modifier ni annuler
        String otherToken = TestJwtFactory.bearer(UUID.randomUUID(), "PARENT");
        mockMvc.perform(put("/api/events/{id}", eventId)
                        .header(HttpHeaders.AUTHORIZATION, otherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
        mockMvc.perform(delete("/api/events/{id}", eventId).header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isForbidden());

        // L'organisateur peut modifier
        mockMvc.perform(put("/api/events/{id}", eventId)
                        .header(HttpHeaders.AUTHORIZATION, organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.capacity").value(20));

        // Un ADMIN peut annuler
        mockMvc.perform(delete("/api/events/{id}", eventId)
                        .header(HttpHeaders.AUTHORIZATION, TestJwtFactory.bearer(UUID.randomUUID(), "ADMIN")))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/events/{id}", eventId).header(HttpHeaders.AUTHORIZATION, organizerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        // Un événement annulé ne peut plus être modifié
        mockMvc.perform(put("/api/events/{id}", eventId)
                        .header(HttpHeaders.AUTHORIZATION, organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isConflict());
    }

    @Test
    void getUnknownEvent_returns404_andInvalidId_returns400() throws Exception {
        mockMvc.perform(get("/api/events/{id}", UUID.randomUUID()).header(HttpHeaders.AUTHORIZATION, organizerToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Not Found"));
        mockMvc.perform(get("/api/events/not-a-uuid").header(HttpHeaders.AUTHORIZATION, organizerToken))
                .andExpect(status().isBadRequest());
    }

    @Test
    void myOrganizedEvents_returnsOnlyMine() throws Exception {
        createEvent(EventFixtures.request(LocalDateTime.now().plusDays(4).withNano(0), 10));
        eventRepository.save(EventFixtures.event(UUID.randomUUID(), LocalDateTime.now().plusDays(4), 10, 0));

        mockMvc.perform(get("/api/events/me/organized").header(HttpHeaders.AUTHORIZATION, organizerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].organizerId").value(organizerId.toString()));
    }

    @Test
    void search_appliesFilters() throws Exception {
        LocalDateTime base = LocalDateTime.now().plusDays(10).withHour(10).withMinute(0).withSecond(0).withNano(0);
        // Lyon centre (atelier, 3-8 ans), Villeurbanne (~4 km, sport, 1-3 ans, complet), Paris (rencontre)
        UUID lyon = createEvent(new EventRequest("Atelier Lyon", null, EventCategory.ATELIER, base, base.plusHours(2),
                null, null, "Lyon", 45.7640, 4.8357, 10, 3, 8));
        UUID villeurbanne = createEvent(new EventRequest("Baby gym", null, EventCategory.SPORT, base.plusDays(1),
                base.plusDays(1).plusHours(1), null, null, "Villeurbanne", 45.7719, 4.8902, 1, 1, 3));
        UUID paris = createEvent(new EventRequest("Café parents", null, EventCategory.RENCONTRE_PARENTS,
                base.plusDays(20), base.plusDays(20).plusHours(2), null, null, "Paris", 48.8566, 2.3522, 30, null, null));

        // Rendre l'événement de Villeurbanne complet
        var full = eventRepository.findById(villeurbanne).orElseThrow();
        full.setReservedPlaces(1);
        eventRepository.save(full);

        assertThat(searchIds("city=lyon")).containsExactly(lyon.toString());
        assertThat(searchIds("category=SPORT")).containsExactly(villeurbanne.toString());
        assertThat(searchIds("childAge=5")).containsExactlyInAnyOrder(lyon.toString(), paris.toString());
        assertThat(searchIds("lat=45.7640&lng=4.8357&radiusKm=10"))
                .containsExactlyInAnyOrder(lyon.toString(), villeurbanne.toString());
        assertThat(searchIds("lat=45.7640&lng=4.8357&radiusKm=2")).containsExactly(lyon.toString());
        assertThat(searchIds("onlyAvailable=true")).containsExactlyInAnyOrder(lyon.toString(), paris.toString());
        assertThat(searchIds("dateFrom=" + base.plusDays(15).toLocalDate())).containsExactly(paris.toString());
        assertThat(searchIds("dateTo=" + base.toLocalDate())).containsExactly(lyon.toString());
        assertThat(searchIds("sort=title,desc")).containsExactly(paris.toString(), villeurbanne.toString(), lyon.toString());

        mockMvc.perform(get("/api/events?sort=organizerId").header(HttpHeaders.AUTHORIZATION, organizerToken))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/events?lat=45.0").header(HttpHeaders.AUTHORIZATION, organizerToken))
                .andExpect(status().isBadRequest());
    }

    private java.util.List<String> searchIds(String query) throws Exception {
        String json = mockMvc.perform(get("/api/events?" + query).header(HttpHeaders.AUTHORIZATION, organizerToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode content = objectMapper.readTree(json).get("content");
        java.util.List<String> ids = new java.util.ArrayList<>();
        content.forEach(node -> ids.add(node.get("id").asText()));
        return ids;
    }

    private UUID createEvent(EventRequest request) throws Exception {
        String json = mockMvc.perform(post("/api/events")
                        .header(HttpHeaders.AUTHORIZATION, organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(json).get("id").asText());
    }
}
