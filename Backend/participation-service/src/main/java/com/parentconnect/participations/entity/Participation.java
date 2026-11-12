package com.parentconnect.participations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Entité métier principale du microservice Participation Service.
 * <p>
 * {@code eventId} est un simple identifiant provenant d'Event Service : aucune relation JPA
 * ni clé étrangère SQL vers une autre base.
 */
@Entity
@Table(name = "participations",
        uniqueConstraints = @UniqueConstraint(name = "uk_participations_event_user", columnNames = {"event_id", "user_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Participation {

    @Id
    private UUID id;

    @Column(name = "event_id", nullable = false, updatable = false)
    private UUID eventId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ParticipationStatus status;

    /**
     * Identifiant de l'opération de réservation qui détient la place côté Event Service.
     * Sert à libérer exactement cette place (idempotence, pas de double libération) et à la réconciliation.
     */
    @Column(name = "reservation_operation_id", nullable = false)
    private UUID reservationOperationId;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    /** Nom affiché à l'organisateur (issu du token, jamais saisi par le client). */
    @Column(name = "participant_name", length = 120)
    private String participantName;

    /** Nombre d'enfants qui viennent (information pour l'organisateur ; une inscription = une place). */
    @Builder.Default
    @Column(name = "children_count", nullable = false)
    private Integer childrenCount = 1;

    /** Message facultatif à l'organisateur. */
    @Column(name = "note", length = 500)
    private String note;

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
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public boolean isConfirmed() {
        return status == ParticipationStatus.CONFIRMED;
    }

    /** Met à jour les détails saisis lors de l'inscription (ou de la réinscription). */
    public void applyDetails(String participantName, int childrenCount, String note) {
        if (participantName != null) {
            this.participantName = participantName;
        }
        this.childrenCount = childrenCount;
        this.note = note;
    }

    public void confirm(UUID operationId, LocalDateTime now) {
        this.status = ParticipationStatus.CONFIRMED;
        this.reservationOperationId = operationId;
        this.joinedAt = now;
        this.cancelledAt = null;
    }

    public void cancel(LocalDateTime now) {
        this.status = ParticipationStatus.CANCELLED;
        this.cancelledAt = now;
    }
}
