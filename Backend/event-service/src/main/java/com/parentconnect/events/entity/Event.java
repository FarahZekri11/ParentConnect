package com.parentconnect.events.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Entité métier principale du microservice Event Service.
 */
@Entity
@Table(name = "events")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Event {

    @Id
    private UUID id;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EventCategory category;

    @Column(name = "start_date_time", nullable = false)
    private LocalDateTime startDateTime;

    @Column(name = "end_date_time", nullable = false)
    private LocalDateTime endDateTime;

    @Column(name = "location_name", length = 150)
    private String locationName;

    @Column(length = 255)
    private String address;

    @Column(nullable = false, length = 100)
    private String city;

    private Double latitude;

    private Double longitude;

    @Column(nullable = false)
    private Integer capacity;

    @Column(name = "min_child_age")
    private Integer minChildAge;

    @Column(name = "max_child_age")
    private Integer maxChildAge;

    @Column(name = "organizer_id", nullable = false, updatable = false)
    private UUID organizerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EventStatus status;

    @Column(name = "reserved_places", nullable = false)
    @Builder.Default
    private Integer reservedPlaces = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    private Long version;

    @PrePersist
    void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
        if (reservedPlaces == null) {
            reservedPlaces = 0;
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public int availablePlaces() {
        return Math.max(0, capacity - reservedPlaces);
    }

    public boolean isFull() {
        return reservedPlaces >= capacity;
    }

    public boolean hasStarted(LocalDateTime now) {
        return !startDateTime.isAfter(now);
    }

    public boolean isOrganizer(UUID userId) {
        return organizerId.equals(userId);
    }

    /** Occupe une place. Doit être appelé sous verrou pessimiste. */
    public void occupySeat() {
        if (isFull()) {
            throw new IllegalStateException("Capacity exceeded");
        }
        reservedPlaces = reservedPlaces + 1;
    }

    /** Libère une place. Doit être appelé sous verrou pessimiste. */
    public void freeSeat() {
        reservedPlaces = Math.max(0, reservedPlaces - 1);
    }
}
