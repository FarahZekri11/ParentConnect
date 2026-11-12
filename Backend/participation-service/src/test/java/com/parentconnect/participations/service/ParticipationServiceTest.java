package com.parentconnect.participations.service;

import com.parentconnect.participations.client.EventServiceClient;
import com.parentconnect.participations.client.EventSnapshot;
import com.parentconnect.participations.client.SeatReleaseResult;
import com.parentconnect.participations.client.SeatReservationResult;
import com.parentconnect.participations.dto.ParticipationResponse;
import com.parentconnect.participations.entity.Participation;
import com.parentconnect.participations.entity.ParticipationStatus;
import com.parentconnect.participations.exception.BusinessConflictException;
import com.parentconnect.participations.exception.ForbiddenOperationException;
import com.parentconnect.participations.exception.ResourceNotFoundException;
import com.parentconnect.participations.exception.ServiceUnavailableException;
import com.parentconnect.participations.mapper.ParticipationMapper;
import com.parentconnect.participations.messaging.EventNotificationMessage;
import com.parentconnect.participations.messaging.EventNotificationType;
import com.parentconnect.participations.repository.ParticipationRepository;
import com.parentconnect.participations.security.CurrentUser;
import com.parentconnect.participations.security.Roles;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ParticipationServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-29T14:00:00Z"), ZoneId.of("Europe/Paris"));
    private static final LocalDateTime NOW = LocalDateTime.now(CLOCK);

    private final UUID eventId = UUID.randomUUID();
    private final UUID organizerId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final CurrentUser parent = new CurrentUser(userId, Set.of(Roles.PARENT));

    @Mock
    private ParticipationRepository repository;
    @Mock
    private ParticipationStore store;
    @Mock
    private EventServiceClient client;
    @Mock
    private ApplicationEventPublisher publisher;

    private ParticipationService service;

    @BeforeEach
    void setUp() {
        service = new ParticipationService(repository, store, client, new ParticipationMapper(), publisher, CLOCK);
    }

    @Test
    void join_success_reservesSeatThenConfirmsAndNotifies() {
        givenEvent("PUBLISHED", 10, 3);
        when(store.find(eventId, userId)).thenReturn(Optional.empty());
        when(client.reserveSeat(eq(eventId), eq(userId), any())).thenAnswer(inv ->
                reservation(inv.getArgument(2), false));
        when(store.confirm(eq(eventId), eq(userId), any(), any())).thenAnswer(inv ->
                participation(ParticipationStatus.CONFIRMED, inv.getArgument(2)));

        ParticipationResponse response = service.join(eventId, parent);

        assertThat(response.status()).isEqualTo(ParticipationStatus.CONFIRMED);
        ArgumentCaptor<UUID> reservedOp = ArgumentCaptor.forClass(UUID.class);
        ArgumentCaptor<UUID> confirmedOp = ArgumentCaptor.forClass(UUID.class);
        verify(client).reserveSeat(eq(eventId), eq(userId), reservedOp.capture());
        verify(store).confirm(eq(eventId), eq(userId), confirmedOp.capture(), any());
        assertThat(confirmedOp.getValue()).isEqualTo(reservedOp.getValue());

        ArgumentCaptor<EventNotificationMessage> message = ArgumentCaptor.forClass(EventNotificationMessage.class);
        verify(publisher).publishEvent(message.capture());
        assertThat(message.getValue().type()).isEqualTo(EventNotificationType.EventJoined);
        assertThat(message.getValue().recipientUserIds()).containsExactly(organizerId, userId);
    }

    @Test
    void join_twice_isRejected() {
        when(store.find(eventId, userId)).thenReturn(Optional.of(participation(ParticipationStatus.CONFIRMED, UUID.randomUUID())));

        assertThatThrownBy(() -> service.join(eventId, parent))
                .isInstanceOf(BusinessConflictException.class)
                .hasMessageContaining("déjà inscrit");
        verify(client, never()).reserveSeat(any(), any(), any());
    }

    @Test
    void join_fullEvent_isRejected() {
        givenEvent("PUBLISHED", 10, 10);
        when(store.find(eventId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.join(eventId, parent))
                .isInstanceOf(BusinessConflictException.class)
                .hasMessage("L'événement est complet");
        verify(client, never()).reserveSeat(any(), any(), any());
    }

    @Test
    void join_whenEventBecomesFullDuringReservation_propagatesConflictWithoutCompensation() {
        givenEvent("PUBLISHED", 10, 9);
        when(store.find(eventId, userId)).thenReturn(Optional.empty());
        when(client.reserveSeat(eq(eventId), eq(userId), any()))
                .thenThrow(new BusinessConflictException("L'événement est complet"));

        assertThatThrownBy(() -> service.join(eventId, parent)).isInstanceOf(BusinessConflictException.class);
        verify(client, never()).releaseSeat(any(), any(), any(), any());
        verify(store, never()).confirm(any(), any(), any(), any());
    }

    @Test
    void join_cancelledEvent_isRejected() {
        givenEvent("CANCELLED", 10, 0);
        when(store.find(eventId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.join(eventId, parent))
                .isInstanceOf(BusinessConflictException.class)
                .hasMessageContaining("annulé");
    }

    @Test
    void join_pastEvent_isRejected() {
        when(store.find(eventId, userId)).thenReturn(Optional.empty());
        when(client.getEvent(eventId)).thenReturn(new EventSnapshot(eventId, "Atelier", organizerId, "PUBLISHED",
                NOW.minusHours(1), NOW.plusHours(1), 10, 0, 10, false));

        assertThatThrownBy(() -> service.join(eventId, parent))
                .isInstanceOf(BusinessConflictException.class)
                .hasMessageContaining("commencé");
    }

    @Test
    void join_ownEvent_isRejected() {
        givenEvent("PUBLISHED", 10, 0);
        CurrentUser organizer = new CurrentUser(organizerId, Set.of(Roles.PARENT));
        when(store.find(eventId, organizerId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.join(eventId, organizer))
                .isInstanceOf(BusinessConflictException.class)
                .hasMessageContaining("organisateur");
    }

    @Test
    void join_unknownEvent_returnsNotFound() {
        when(store.find(eventId, userId)).thenReturn(Optional.empty());
        when(client.getEvent(eventId)).thenThrow(new ResourceNotFoundException("Événement introuvable"));

        assertThatThrownBy(() -> service.join(eventId, parent)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void join_whenReservationTimesOut_compensatesAndReturns503() {
        givenEvent("PUBLISHED", 10, 0);
        when(store.find(eventId, userId)).thenReturn(Optional.empty());
        when(client.reserveSeat(eq(eventId), eq(userId), any()))
                .thenThrow(new ServiceUnavailableException("indisponible"));

        assertThatThrownBy(() -> service.join(eventId, parent)).isInstanceOf(ServiceUnavailableException.class);

        ArgumentCaptor<UUID> reservedOp = ArgumentCaptor.forClass(UUID.class);
        ArgumentCaptor<UUID> releasedOp = ArgumentCaptor.forClass(UUID.class);
        verify(client).reserveSeat(eq(eventId), eq(userId), reservedOp.capture());
        verify(client).releaseSeat(eq(eventId), eq(userId), releasedOp.capture(), isNull());
        assertThat(releasedOp.getValue()).isEqualTo(reservedOp.getValue());
        verify(store, never()).confirm(any(), any(), any(), any());
    }

    @Test
    void join_whenLocalSaveFails_compensatesReservation() {
        givenEvent("PUBLISHED", 10, 0);
        when(store.find(eventId, userId)).thenReturn(Optional.empty());
        when(client.reserveSeat(eq(eventId), eq(userId), any())).thenAnswer(inv -> reservation(inv.getArgument(2), false));
        when(store.confirm(any(), any(), any(), any())).thenThrow(new IllegalStateException("base indisponible"));
        when(client.releaseSeat(any(), any(), any(), any())).thenReturn(
                new SeatReleaseResult(eventId, userId, true, "RELEASED", 0, 10));

        assertThatThrownBy(() -> service.join(eventId, parent)).isInstanceOf(ServiceUnavailableException.class);

        verify(client).releaseSeat(eq(eventId), eq(userId), any(), isNull());
        verify(publisher, never()).publishEvent(any(Object.class));
    }

    @Test
    void join_whenCompensationAlsoFails_doesNotHideOriginalError() {
        givenEvent("PUBLISHED", 10, 0);
        when(store.find(eventId, userId)).thenReturn(Optional.empty());
        when(client.reserveSeat(eq(eventId), eq(userId), any())).thenAnswer(inv -> reservation(inv.getArgument(2), false));
        when(store.confirm(any(), any(), any(), any())).thenThrow(new IllegalStateException("base indisponible"));
        when(client.releaseSeat(any(), any(), any(), any())).thenThrow(new ServiceUnavailableException("down"));

        // La place orpheline sera libérée par la réconciliation
        assertThatThrownBy(() -> service.join(eventId, parent))
                .isInstanceOf(ServiceUnavailableException.class)
                .hasMessageContaining("enregistrée");
    }

    @Test
    void join_whenSeatAlreadyHeldByPreviousOperation_reusesItWithoutCompensation() {
        UUID previousOperation = UUID.randomUUID();
        givenEvent("PUBLISHED", 10, 1);
        when(store.find(eventId, userId)).thenReturn(Optional.of(participation(ParticipationStatus.CANCELLED, previousOperation)));
        when(client.reserveSeat(eq(eventId), eq(userId), any())).thenReturn(reservation(previousOperation, true));
        when(store.confirm(eventId, userId, previousOperation, NOW)).thenThrow(new IllegalStateException("panne"));

        assertThatThrownBy(() -> service.join(eventId, parent)).isInstanceOf(ServiceUnavailableException.class);
        // La place appartient à une opération antérieure : ne surtout pas la libérer ici
        verify(client, never()).releaseSeat(any(), any(), any(), any());
    }

    @Test
    void join_concurrentDuplicate_returnsWinningParticipation() {
        UUID operation = UUID.randomUUID();
        givenEvent("PUBLISHED", 10, 0);
        when(store.find(eventId, userId)).thenReturn(Optional.empty());
        when(client.reserveSeat(eq(eventId), eq(userId), any())).thenReturn(reservation(operation, true));
        when(store.confirm(any(), any(), any(), any())).thenThrow(new DataIntegrityViolationException("uk"));
        Participation winner = participation(ParticipationStatus.CONFIRMED, operation);
        when(store.findConfirmedWithOperation(eventId, userId, operation)).thenReturn(Optional.of(winner));

        ParticipationResponse response = service.join(eventId, parent);

        assertThat(response.id()).isEqualTo(winner.getId());
        verify(client, never()).releaseSeat(any(), any(), any(), any());
    }

    @Test
    void rejoin_afterCancellation_reactivatesWithNewOperation() {
        UUID oldOperation = UUID.randomUUID();
        givenEvent("PUBLISHED", 10, 0);
        when(store.find(eventId, userId)).thenReturn(Optional.of(participation(ParticipationStatus.CANCELLED, oldOperation)));
        when(client.reserveSeat(eq(eventId), eq(userId), any())).thenAnswer(inv -> reservation(inv.getArgument(2), false));
        when(store.confirm(eq(eventId), eq(userId), any(), any())).thenAnswer(inv ->
                participation(ParticipationStatus.CONFIRMED, inv.getArgument(2)));

        ParticipationResponse response = service.join(eventId, parent);

        assertThat(response.status()).isEqualTo(ParticipationStatus.CONFIRMED);
        ArgumentCaptor<UUID> op = ArgumentCaptor.forClass(UUID.class);
        verify(store).confirm(eq(eventId), eq(userId), op.capture(), any());
        assertThat(op.getValue()).isNotEqualTo(oldOperation);
    }

    @Test
    void leave_cancelsLocallyThenReleasesExactSeat() {
        UUID operation = UUID.randomUUID();
        Participation participation = participation(ParticipationStatus.CONFIRMED, operation);
        when(store.find(eventId, userId)).thenReturn(Optional.of(participation));
        givenEvent("PUBLISHED", 10, 1);

        service.leave(eventId, parent);

        verify(store).cancel(participation.getId(), NOW);
        verify(client).releaseSeat(eventId, userId, operation, null);
        ArgumentCaptor<EventNotificationMessage> message = ArgumentCaptor.forClass(EventNotificationMessage.class);
        verify(publisher).publishEvent(message.capture());
        assertThat(message.getValue().type()).isEqualTo(EventNotificationType.EventLeft);
    }

    @Test
    void leave_whenReleaseFails_stillSucceeds() {
        UUID operation = UUID.randomUUID();
        Participation participation = participation(ParticipationStatus.CONFIRMED, operation);
        when(store.find(eventId, userId)).thenReturn(Optional.of(participation));
        givenEvent("PUBLISHED", 10, 1);
        when(client.releaseSeat(any(), any(), any(), any())).thenThrow(new ServiceUnavailableException("down"));

        service.leave(eventId, parent);

        verify(store).cancel(participation.getId(), NOW);
    }

    @Test
    void leave_withoutActiveParticipation_returnsNotFound() {
        when(store.find(eventId, userId)).thenReturn(Optional.of(participation(ParticipationStatus.CANCELLED, UUID.randomUUID())));

        assertThatThrownBy(() -> service.leave(eventId, parent)).isInstanceOf(ResourceNotFoundException.class);
        verify(client, never()).releaseSeat(any(), any(), any(), any());
    }

    @Test
    void leave_whenEventServiceDown_changesNothing() {
        when(store.find(eventId, userId)).thenReturn(Optional.of(participation(ParticipationStatus.CONFIRMED, UUID.randomUUID())));
        when(client.getEvent(eventId)).thenThrow(new ServiceUnavailableException("down"));

        assertThatThrownBy(() -> service.leave(eventId, parent)).isInstanceOf(ServiceUnavailableException.class);
        verify(store, never()).cancel(any(), any());
    }

    @Test
    void participants_onlyForOrganizerOrAdmin() {
        givenEvent("PUBLISHED", 10, 1);
        assertThatThrownBy(() -> service.participants(eventId, parent, PageRequest.of(0, 10)))
                .isInstanceOf(ForbiddenOperationException.class);

        when(repository.findByEventIdAndStatus(eq(eventId), eq(ParticipationStatus.CONFIRMED), any()))
                .thenReturn(new PageImpl<>(List.of(participation(ParticipationStatus.CONFIRMED, UUID.randomUUID()))));
        var organizer = new CurrentUser(organizerId, Set.of(Roles.PARENT));
        assertThat(service.participants(eventId, organizer, PageRequest.of(0, 10)).totalElements()).isEqualTo(1);
        var admin = new CurrentUser(UUID.randomUUID(), Set.of(Roles.ADMIN));
        assertThat(service.participants(eventId, admin, PageRequest.of(0, 10)).totalElements()).isEqualTo(1);
    }

    private void givenEvent(String status, int capacity, int reserved) {
        when(client.getEvent(eventId)).thenReturn(new EventSnapshot(eventId, "Atelier peinture", organizerId, status,
                NOW.plusDays(2), NOW.plusDays(2).plusHours(2), capacity, reserved, capacity - reserved,
                "PUBLISHED".equals(status) && reserved < capacity));
    }

    private SeatReservationResult reservation(UUID holderOperation, boolean alreadyHeld) {
        return new SeatReservationResult(eventId, userId, holderOperation, "ACTIVE", alreadyHeld, 1, 9);
    }

    private Participation participation(ParticipationStatus status, UUID operation) {
        return Participation.builder()
                .id(UUID.randomUUID())
                .eventId(eventId)
                .userId(userId)
                .status(status)
                .reservationOperationId(operation)
                .joinedAt(NOW)
                .createdAt(NOW)
                .updatedAt(NOW)
                .build();
    }
}
