package com.parentconnect.events.service;

import com.parentconnect.events.dto.EventResponse;
import com.parentconnect.events.entity.Event;
import com.parentconnect.events.entity.EventStatus;
import com.parentconnect.events.exception.BusinessConflictException;
import com.parentconnect.events.exception.ForbiddenOperationException;
import com.parentconnect.events.exception.InvalidRequestException;
import com.parentconnect.events.mapper.EventMapper;
import com.parentconnect.events.messaging.EventNotificationMessage;
import com.parentconnect.events.messaging.EventNotificationType;
import com.parentconnect.events.repository.EventRepository;
import com.parentconnect.events.repository.SeatReservationRepository;
import com.parentconnect.events.security.CurrentUser;
import com.parentconnect.events.security.Roles;
import com.parentconnect.events.support.EventFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EventServiceTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Paris");
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-29T14:00:00Z"), ZONE);
    private static final LocalDateTime NOW = LocalDateTime.now(CLOCK);

    private final UUID organizerId = UUID.randomUUID();
    private final CurrentUser organizer = new CurrentUser(organizerId, Set.of(Roles.PARENT));
    private final CurrentUser otherParent = new CurrentUser(UUID.randomUUID(), Set.of(Roles.PARENT));
    private final CurrentUser admin = new CurrentUser(UUID.randomUUID(), Set.of(Roles.ADMIN));

    @Mock
    private EventRepository eventRepository;
    @Mock
    private SeatReservationRepository seatReservationRepository;
    @Mock
    private ApplicationEventPublisher applicationEventPublisher;

    private EventService eventService;

    @BeforeEach
    void setUp() {
        eventService = new EventService(eventRepository, seatReservationRepository, new EventMapper(),
                applicationEventPublisher, CLOCK);
    }

    @Test
    void create_setsOrganizerFromJwtAndPublishedStatus() {
        when(eventRepository.save(any(Event.class))).thenAnswer(inv -> inv.getArgument(0));

        EventResponse response = eventService.create(EventFixtures.request(NOW.plusDays(3), 10), organizer);

        assertThat(response.organizerId()).isEqualTo(organizerId);
        assertThat(response.status()).isEqualTo(EventStatus.PUBLISHED);
        assertThat(response.reservedPlaces()).isZero();
        assertThat(response.availablePlaces()).isEqualTo(10);
    }

    @Test
    void create_rejectsStartDateInThePast() {
        assertThatThrownBy(() -> eventService.create(EventFixtures.request(NOW.minusHours(1), 10), organizer))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining("futur");
        verify(eventRepository, never()).save(any());
    }

    @Test
    void create_rejectsEndBeforeStart() {
        var base = EventFixtures.request(NOW.plusDays(3), 10);
        var invalid = new com.parentconnect.events.dto.EventRequest(base.title(), base.description(), base.category(),
                base.startDateTime(), base.startDateTime().minusHours(1), base.locationName(), base.address(),
                base.city(), base.latitude(), base.longitude(), base.capacity(), base.minChildAge(), base.maxChildAge());

        assertThatThrownBy(() -> eventService.create(invalid, organizer))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining("date de fin");
    }

    @Test
    void create_rejectsInconsistentChildAges() {
        var base = EventFixtures.request(NOW.plusDays(3), 10);
        var invalid = new com.parentconnect.events.dto.EventRequest(base.title(), base.description(), base.category(),
                base.startDateTime(), base.endDateTime(), base.locationName(), base.address(),
                base.city(), base.latitude(), base.longitude(), base.capacity(), 10, 3);

        assertThatThrownBy(() -> eventService.create(invalid, organizer))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void update_byOrganizer_succeedsAndNotifiesParticipants() {
        Event event = EventFixtures.event(organizerId, NOW.plusDays(5), 10, 2);
        UUID participant = UUID.randomUUID();
        when(eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));
        when(eventRepository.saveAndFlush(event)).thenReturn(event);
        when(seatReservationRepository.findUserIdsByEventIdAndStatus(any(), any())).thenReturn(List.of(participant));

        var request = EventFixtures.request(NOW.plusDays(6), 12);
        EventResponse response = eventService.update(event.getId(), request, organizer);

        assertThat(response.capacity()).isEqualTo(12);
        assertThat(response.startDateTime()).isEqualTo(NOW.plusDays(6));
        ArgumentCaptor<EventNotificationMessage> captor = ArgumentCaptor.forClass(EventNotificationMessage.class);
        verify(applicationEventPublisher).publishEvent(captor.capture());
        assertThat(captor.getValue().type()).isEqualTo(EventNotificationType.EventUpdated);
        assertThat(captor.getValue().recipientUserIds()).containsExactly(participant);
    }

    @Test
    void update_byAdmin_isAllowed() {
        Event event = EventFixtures.event(organizerId, NOW.plusDays(5), 10, 0);
        when(eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));
        when(eventRepository.saveAndFlush(event)).thenReturn(event);

        EventResponse response = eventService.update(event.getId(), EventFixtures.request(NOW.plusDays(5), 15), admin);

        assertThat(response.capacity()).isEqualTo(15);
    }

    @Test
    void update_byOtherUser_isForbidden() {
        Event event = EventFixtures.event(organizerId, NOW.plusDays(5), 10, 0);
        when(eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));

        assertThatThrownBy(() -> eventService.update(event.getId(), EventFixtures.request(NOW.plusDays(5), 10), otherParent))
                .isInstanceOf(ForbiddenOperationException.class);
        verify(eventRepository, never()).saveAndFlush(any());
    }

    @Test
    void update_cannotReduceCapacityBelowReservedPlaces() {
        Event event = EventFixtures.event(organizerId, NOW.plusDays(5), 10, 6);
        when(eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));

        assertThatThrownBy(() -> eventService.update(event.getId(), EventFixtures.request(NOW.plusDays(5), 5), organizer))
                .isInstanceOf(BusinessConflictException.class)
                .hasMessageContaining("capacité");
        assertThat(event.getCapacity()).isEqualTo(10);
    }

    @Test
    void update_ofCancelledEvent_isRejected() {
        Event event = EventFixtures.event(organizerId, NOW.plusDays(5), 10, 0);
        event.setStatus(EventStatus.CANCELLED);
        when(eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));

        assertThatThrownBy(() -> eventService.update(event.getId(), EventFixtures.request(NOW.plusDays(5), 10), organizer))
                .isInstanceOf(BusinessConflictException.class);
    }

    @Test
    void cancel_byOrganizer_setsCancelledAndNotifies() {
        Event event = EventFixtures.event(organizerId, NOW.plusDays(5), 10, 1);
        when(eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));

        eventService.cancel(event.getId(), organizer);

        assertThat(event.getStatus()).isEqualTo(EventStatus.CANCELLED);
        ArgumentCaptor<EventNotificationMessage> captor = ArgumentCaptor.forClass(EventNotificationMessage.class);
        verify(applicationEventPublisher).publishEvent(captor.capture());
        assertThat(captor.getValue().type()).isEqualTo(EventNotificationType.EventCancelled);
    }

    @Test
    void cancel_isIdempotent() {
        Event event = EventFixtures.event(organizerId, NOW.plusDays(5), 10, 1);
        event.setStatus(EventStatus.CANCELLED);
        when(eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));

        eventService.cancel(event.getId(), organizer);

        verify(eventRepository, never()).saveAndFlush(any());
        verify(applicationEventPublisher, never()).publishEvent(any(Object.class));
    }

    @Test
    void cancel_byOtherUser_isForbidden() {
        Event event = EventFixtures.event(organizerId, NOW.plusDays(5), 10, 0);
        when(eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));

        assertThatThrownBy(() -> eventService.cancel(event.getId(), otherParent))
                .isInstanceOf(ForbiddenOperationException.class);
        assertThat(event.getStatus()).isEqualTo(EventStatus.PUBLISHED);
    }
}
