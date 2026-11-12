package com.parentconnect.events.service;

import com.parentconnect.events.dto.internal.SeatReleaseResponse;
import com.parentconnect.events.dto.internal.SeatReservationResponse;
import com.parentconnect.events.entity.Event;
import com.parentconnect.events.entity.EventStatus;
import com.parentconnect.events.entity.SeatReservationStatus;
import com.parentconnect.events.exception.BusinessConflictException;
import com.parentconnect.events.repository.EventRepository;
import com.parentconnect.events.repository.SeatReservationRepository;
import com.parentconnect.events.security.CurrentUser;
import com.parentconnect.events.security.Roles;
import com.parentconnect.events.support.AbstractIntegrationTest;
import com.parentconnect.events.support.EventFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration (PostgreSQL réel) de la réservation atomique et idempotente des places.
 */
class SeatReservationIT extends AbstractIntegrationTest {

    @Autowired
    private SeatReservationService seatReservationService;
    @Autowired
    private EventService eventService;
    @Autowired
    private EventRepository eventRepository;
    @Autowired
    private SeatReservationRepository seatReservationRepository;

    private final UUID organizerId = UUID.randomUUID();

    @BeforeEach
    void clean() {
        seatReservationRepository.deleteAll();
        eventRepository.deleteAll();
    }

    @Test
    void reserve_incrementsReservedPlacesAtomically() {
        Event event = persist(3);
        UUID user = UUID.randomUUID();

        SeatReservationResponse response = seatReservationService.reserve(event.getId(), user, UUID.randomUUID());

        assertThat(response.status()).isEqualTo(SeatReservationStatus.ACTIVE);
        assertThat(response.alreadyHeld()).isFalse();
        assertThat(response.reservedPlaces()).isEqualTo(1);
        assertThat(reload(event).getReservedPlaces()).isEqualTo(1);
    }

    @Test
    void concurrentReservations_neverExceedCapacity() throws Exception {
        int capacity = 5;
        int contenders = 25;
        Event event = persist(capacity);

        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger success = new AtomicInteger();
        AtomicInteger full = new AtomicInteger();
        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < contenders; i++) {
            futures.add(pool.submit((Callable<Void>) () -> {
                start.await();
                try {
                    seatReservationService.reserve(event.getId(), UUID.randomUUID(), UUID.randomUUID());
                    success.incrementAndGet();
                } catch (BusinessConflictException ex) {
                    full.incrementAndGet();
                }
                return null;
            }));
        }
        start.countDown();
        for (Future<?> future : futures) {
            future.get(30, TimeUnit.SECONDS);
        }
        pool.shutdown();

        assertThat(success.get()).isEqualTo(capacity);
        assertThat(full.get()).isEqualTo(contenders - capacity);
        assertThat(reload(event).getReservedPlaces()).isEqualTo(capacity);
        assertThat(seatReservationRepository.countByEventIdAndStatus(event.getId(), SeatReservationStatus.ACTIVE))
                .isEqualTo(capacity);
    }

    @Test
    void concurrentDuplicateRequestsOfSameUser_consumeOneSeat() throws Exception {
        Event event = persist(10);
        UUID user = UUID.randomUUID();
        UUID operation = UUID.randomUUID();

        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<SeatReservationResponse>> futures = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            // Moitié rejeux de la même opération, moitié nouvelles opérations (double-clic)
            UUID op = i % 2 == 0 ? operation : UUID.randomUUID();
            futures.add(pool.submit(() -> {
                start.await();
                return seatReservationService.reserve(event.getId(), user, op);
            }));
        }
        start.countDown();
        for (Future<SeatReservationResponse> future : futures) {
            assertThat(future.get(30, TimeUnit.SECONDS).status()).isEqualTo(SeatReservationStatus.ACTIVE);
        }
        pool.shutdown();

        assertThat(reload(event).getReservedPlaces()).isEqualTo(1);
    }

    @Test
    void reserve_isIdempotentForSameOperation() {
        Event event = persist(5);
        UUID user = UUID.randomUUID();
        UUID operation = UUID.randomUUID();

        seatReservationService.reserve(event.getId(), user, operation);
        SeatReservationResponse replay = seatReservationService.reserve(event.getId(), user, operation);

        assertThat(replay.operationId()).isEqualTo(operation);
        assertThat(replay.alreadyHeld()).isFalse();
        assertThat(reload(event).getReservedPlaces()).isEqualTo(1);
    }

    @Test
    void reserve_withNewOperationWhileSeatHeld_returnsHolderOperation() {
        Event event = persist(5);
        UUID user = UUID.randomUUID();
        UUID first = UUID.randomUUID();

        seatReservationService.reserve(event.getId(), user, first);
        SeatReservationResponse second = seatReservationService.reserve(event.getId(), user, UUID.randomUUID());

        assertThat(second.alreadyHeld()).isTrue();
        assertThat(second.operationId()).isEqualTo(first);
        assertThat(reload(event).getReservedPlaces()).isEqualTo(1);
    }

    @Test
    void release_freesSeatOnlyOnce() {
        Event event = persist(5);
        UUID user = UUID.randomUUID();
        UUID operation = UUID.randomUUID();
        seatReservationService.reserve(event.getId(), user, operation);

        SeatReleaseResponse first = seatReservationService.release(event.getId(), user, operation, null);
        SeatReleaseResponse second = seatReservationService.release(event.getId(), user, operation, null);

        assertThat(first.released()).isTrue();
        assertThat(second.released()).isFalse();
        assertThat(second.outcome()).isEqualTo("ALREADY_RELEASED");
        assertThat(reload(event).getReservedPlaces()).isZero();
    }

    @Test
    void release_withForeignOperation_doesNothing() {
        Event event = persist(5);
        UUID user = UUID.randomUUID();
        seatReservationService.reserve(event.getId(), user, UUID.randomUUID());

        SeatReleaseResponse response = seatReservationService.release(event.getId(), user, UUID.randomUUID(), null);

        assertThat(response.released()).isFalse();
        assertThat(response.outcome()).isEqualTo("OPERATION_MISMATCH");
        assertThat(reload(event).getReservedPlaces()).isEqualTo(1);
    }

    @Test
    void lateReservationAfterCompensation_isRejected() {
        Event event = persist(5);
        UUID user = UUID.randomUUID();
        UUID operation = UUID.randomUUID();

        // La compensation arrive avant la réservation (réseau) : une pierre tombale est posée
        SeatReleaseResponse release = seatReservationService.release(event.getId(), user, operation, null);
        assertThat(release.outcome()).isEqualTo("NOT_FOUND_TOMBSTONED");

        assertThatThrownBy(() -> seatReservationService.reserve(event.getId(), user, operation))
                .isInstanceOf(BusinessConflictException.class);
        assertThat(reload(event).getReservedPlaces()).isZero();

        // Une nouvelle opération légitime reste possible
        seatReservationService.reserve(event.getId(), user, UUID.randomUUID());
        assertThat(reload(event).getReservedPlaces()).isEqualTo(1);
    }

    @Test
    void release_requireIdle_skipsRecentlyUpdatedReservations() {
        Event event = persist(5);
        UUID user = UUID.randomUUID();
        UUID operation = UUID.randomUUID();
        seatReservationService.reserve(event.getId(), user, operation);

        SeatReleaseResponse response = seatReservationService.release(event.getId(), user, operation, 300);

        assertThat(response.outcome()).isEqualTo("RECENTLY_UPDATED");
        assertThat(reload(event).getReservedPlaces()).isEqualTo(1);
        assertThat(seatReservationService.findActiveReservations(300, null, 10)).isEmpty();
        assertThat(seatReservationService.findActiveReservations(0, null, 10)).hasSize(1);
    }

    @Test
    void reserve_rejectsFullCancelledPastEventsAndOrganizer() {
        Event fullEvent = persist(1);
        seatReservationService.reserve(fullEvent.getId(), UUID.randomUUID(), UUID.randomUUID());
        assertThatThrownBy(() -> seatReservationService.reserve(fullEvent.getId(), UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(BusinessConflictException.class).hasMessageContaining("complet");

        Event cancelled = persist(5);
        eventService.cancel(cancelled.getId(), new CurrentUser(organizerId, Set.of(Roles.PARENT)));
        assertThatThrownBy(() -> seatReservationService.reserve(cancelled.getId(), UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(BusinessConflictException.class).hasMessageContaining("annulé");

        Event past = EventFixtures.event(organizerId, LocalDateTime.now().minusHours(3), 5, 0);
        eventRepository.save(past);
        assertThatThrownBy(() -> seatReservationService.reserve(past.getId(), UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(BusinessConflictException.class).hasMessageContaining("commencé");

        Event own = persist(5);
        assertThatThrownBy(() -> seatReservationService.reserve(own.getId(), organizerId, UUID.randomUUID()))
                .isInstanceOf(BusinessConflictException.class).hasMessageContaining("organisateur");
    }

    @Test
    void capacityCannotBeReducedBelowReservedPlaces() {
        Event event = persist(3);
        seatReservationService.reserve(event.getId(), UUID.randomUUID(), UUID.randomUUID());
        seatReservationService.reserve(event.getId(), UUID.randomUUID(), UUID.randomUUID());

        var request = EventFixtures.request(event.getStartDateTime(), 1);
        assertThatThrownBy(() -> eventService.update(event.getId(), request,
                new CurrentUser(organizerId, Set.of(Roles.PARENT))))
                .isInstanceOf(BusinessConflictException.class);
        assertThat(reload(event).getCapacity()).isEqualTo(3);
    }

    @Test
    void completeFinishedEvents_marksPastEventsCompleted() {
        Event past = EventFixtures.event(organizerId, LocalDateTime.now().minusDays(2), 5, 0);
        eventRepository.save(past);
        Event future = persist(5);

        int updated = eventService.completeFinishedEvents();

        assertThat(updated).isEqualTo(1);
        assertThat(reload(past).getStatus()).isEqualTo(EventStatus.COMPLETED);
        assertThat(reload(future).getStatus()).isEqualTo(EventStatus.PUBLISHED);
    }

    private Event persist(int capacity) {
        return eventRepository.save(EventFixtures.event(organizerId, LocalDateTime.now().plusDays(3), capacity, 0));
    }

    private Event reload(Event event) {
        return eventRepository.findById(event.getId()).orElseThrow();
    }
}
