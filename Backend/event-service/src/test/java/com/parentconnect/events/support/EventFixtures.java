package com.parentconnect.events.support;

import com.parentconnect.events.dto.EventRequest;
import com.parentconnect.events.entity.Event;
import com.parentconnect.events.entity.EventCategory;
import com.parentconnect.events.entity.EventStatus;

import java.time.LocalDateTime;
import java.util.UUID;

public final class EventFixtures {

    private EventFixtures() {
    }

    public static EventRequest request(LocalDateTime start, int capacity) {
        return new EventRequest("Atelier peinture", "Peinture parents-enfants", EventCategory.ATELIER,
                start, start.plusHours(2), "Maison des associations", "12 rue Garibaldi", "Lyon",
                45.76, 4.85, capacity, 3, 8);
    }

    public static Event event(UUID organizerId, LocalDateTime start, int capacity, int reserved) {
        return Event.builder()
                .id(UUID.randomUUID())
                .title("Atelier peinture")
                .category(EventCategory.ATELIER)
                .startDateTime(start)
                .endDateTime(start.plusHours(2))
                .city("Lyon")
                .latitude(45.76)
                .longitude(4.85)
                .capacity(capacity)
                .reservedPlaces(reserved)
                .organizerId(organizerId)
                .status(EventStatus.PUBLISHED)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }
}
