package com.parentconnect.events.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Registre technique des places occupées (ledger), interne à Event Service.
 * <p>
 * Ce n'est pas une entité métier exposée : il garantit l'idempotence des réservations
 * demandées par Participation Service (une ligne par couple événement/utilisateur,
 * associée à l'identifiant de l'opération qui détient la place) et sert de base
 * à la réconciliation entre les deux microservices.
 */
@Entity
@Table(name = "seat_reservations",
        uniqueConstraints = @UniqueConstraint(name = "uk_seat_reservations_event_user", columnNames = {"event_id", "user_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SeatReservation {

    @Id
    private UUID id;

    @Column(name = "event_id", nullable = false, updatable = false)
    private UUID eventId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "operation_id", nullable = false)
    private UUID operationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SeatReservationStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (updatedAt == null) {
            updatedAt = createdAt;
        }
    }

    public boolean isActive() {
        return status == SeatReservationStatus.ACTIVE;
    }

    public void activate(UUID newOperationId, LocalDateTime now) {
        this.operationId = newOperationId;
        this.status = SeatReservationStatus.ACTIVE;
        this.updatedAt = now;
    }

    public void release(LocalDateTime now) {
        this.status = SeatReservationStatus.RELEASED;
        this.updatedAt = now;
    }

    public void touch(LocalDateTime now) {
        this.updatedAt = now;
    }
}
