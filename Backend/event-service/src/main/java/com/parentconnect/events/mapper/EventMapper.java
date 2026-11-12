package com.parentconnect.events.mapper;

import com.parentconnect.events.dto.EventRequest;
import com.parentconnect.events.dto.EventResponse;
import com.parentconnect.events.dto.internal.EventSnapshotResponse;
import com.parentconnect.events.entity.Event;
import com.parentconnect.events.entity.EventStatus;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Mapper manuel entité ↔ DTO (aucune génération de code nécessaire).
 */
@Component
public class EventMapper {

    public Event toNewEntity(EventRequest request, UUID organizerId) {
        Event event = Event.builder()
                .organizerId(organizerId)
                .status(EventStatus.PUBLISHED)
                .reservedPlaces(0)
                .build();
        applyRequest(event, request);
        return event;
    }

    public void applyRequest(Event event, EventRequest request) {
        event.setTitle(request.title().trim());
        event.setDescription(request.description());
        event.setCategory(request.category());
        event.setStartDateTime(request.startDateTime());
        event.setEndDateTime(request.endDateTime());
        event.setLocationName(request.locationName());
        event.setAddress(request.address());
        event.setCity(request.city().trim());
        event.setLatitude(request.latitude());
        event.setLongitude(request.longitude());
        event.setCapacity(request.capacity());
        event.setMinChildAge(request.minChildAge());
        event.setMaxChildAge(request.maxChildAge());
    }

    public EventResponse toResponse(Event event) {
        return new EventResponse(
                event.getId(),
                event.getTitle(),
                event.getDescription(),
                event.getCategory(),
                event.getStartDateTime(),
                event.getEndDateTime(),
                event.getLocationName(),
                event.getAddress(),
                event.getCity(),
                event.getLatitude(),
                event.getLongitude(),
                event.getCapacity(),
                event.getReservedPlaces(),
                event.availablePlaces(),
                event.isFull(),
                event.getMinChildAge(),
                event.getMaxChildAge(),
                event.getOrganizerId(),
                event.getStatus(),
                event.getCreatedAt(),
                event.getUpdatedAt());
    }

    public EventSnapshotResponse toSnapshot(Event event, LocalDateTime now) {
        boolean open = event.getStatus() == EventStatus.PUBLISHED && !event.hasStarted(now) && !event.isFull();
        return new EventSnapshotResponse(
                event.getId(),
                event.getTitle(),
                event.getOrganizerId(),
                event.getStatus(),
                event.getStartDateTime(),
                event.getEndDateTime(),
                event.getCapacity(),
                event.getReservedPlaces(),
                event.availablePlaces(),
                open);
    }
}
