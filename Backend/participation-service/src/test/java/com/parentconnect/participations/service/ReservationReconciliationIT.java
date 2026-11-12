package com.parentconnect.participations.service;

import com.parentconnect.participations.entity.Participation;
import com.parentconnect.participations.entity.ParticipationStatus;
import com.parentconnect.participations.repository.ParticipationRepository;
import com.parentconnect.participations.support.AbstractIntegrationTest;
import com.parentconnect.participations.support.EventServiceStubs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import java.time.LocalDateTime;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Réconciliation : libère les places orphelines côté Event Service, sans toucher aux places légitimes.
 */
@TestPropertySource(properties = {"app.reconciliation.enabled=true", "app.reconciliation.initial-delay=PT1H"})
class ReservationReconciliationIT extends AbstractIntegrationTest {

    @Autowired
    private ReservationReconciliationService reconciliationService;
    @Autowired
    private ParticipationRepository repository;

    @BeforeEach
    void clean() {
        repository.deleteAll();
    }

    @Test
    void releasesOrphanSeatsAndKeepsConfirmedOnes() {
        UUID eventId = UUID.randomUUID();
        UUID confirmedUser = UUID.randomUUID();
        UUID confirmedOp = UUID.randomUUID();
        UUID cancelledUser = UUID.randomUUID();
        UUID cancelledOp = UUID.randomUUID();
        UUID orphanUser = UUID.randomUUID();
        UUID orphanOp = UUID.randomUUID();

        repository.save(participation(eventId, confirmedUser, confirmedOp, ParticipationStatus.CONFIRMED));
        repository.save(participation(eventId, cancelledUser, cancelledOp, ParticipationStatus.CANCELLED));

        EVENT_SERVICE.stubFor(get(urlPathEqualTo("/internal/reservations/active"))
                .withQueryParam("idleForSeconds", equalTo("120"))
                .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                        .withBody("""
                                [{"id":"00000000-0000-0000-0000-000000000001","eventId":"%s","userId":"%s","operationId":"%s","updatedAt":"2026-10-29T10:00:00"},
                                 {"id":"00000000-0000-0000-0000-000000000002","eventId":"%s","userId":"%s","operationId":"%s","updatedAt":"2026-10-29T10:00:00"},
                                 {"id":"00000000-0000-0000-0000-000000000003","eventId":"%s","userId":"%s","operationId":"%s","updatedAt":"2026-10-29T10:00:00"}]
                                """.formatted(eventId, confirmedUser, confirmedOp, eventId, cancelledUser, cancelledOp,
                                eventId, orphanUser, orphanOp))));
        EventServiceStubs.stubReleaseOk(EVENT_SERVICE, eventId);

        var report = reconciliationService.reconcile();

        assertThat(report.checked()).isEqualTo(3);
        assertThat(report.released()).isEqualTo(2);
        String releasePath = "/internal/events/" + eventId + "/reservations/release";
        EVENT_SERVICE.verify(2, postRequestedFor(urlPathEqualTo(releasePath)));
        EVENT_SERVICE.verify(postRequestedFor(urlPathEqualTo(releasePath)).withRequestBody(equalToJson(
                "{\"userId\":\"%s\",\"operationId\":\"%s\",\"requireIdleSeconds\":120}".formatted(orphanUser, orphanOp))));
        EVENT_SERVICE.verify(postRequestedFor(urlPathEqualTo(releasePath)).withRequestBody(equalToJson(
                "{\"userId\":\"%s\",\"operationId\":\"%s\",\"requireIdleSeconds\":120}".formatted(cancelledUser, cancelledOp))));
        EVENT_SERVICE.verify(0, postRequestedFor(urlPathEqualTo(releasePath)).withRequestBody(equalToJson(
                "{\"userId\":\"%s\",\"operationId\":\"%s\",\"requireIdleSeconds\":120}".formatted(confirmedUser, confirmedOp))));
    }

    private static Participation participation(UUID eventId, UUID userId, UUID operation, ParticipationStatus status) {
        return Participation.builder()
                .eventId(eventId)
                .userId(userId)
                .reservationOperationId(operation)
                .status(status)
                .joinedAt(LocalDateTime.now())
                .build();
    }
}
