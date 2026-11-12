package com.parentconnect.events.repository;

import com.parentconnect.events.entity.SeatReservation;
import com.parentconnect.events.entity.SeatReservationStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SeatReservationRepository extends JpaRepository<SeatReservation, UUID> {

    Optional<SeatReservation> findByEventIdAndUserId(UUID eventId, UUID userId);

    long countByEventIdAndStatus(UUID eventId, SeatReservationStatus status);

    @Query("select r.userId from SeatReservation r where r.eventId = :eventId and r.status = :status")
    List<UUID> findUserIdsByEventIdAndStatus(@Param("eventId") UUID eventId,
                                             @Param("status") SeatReservationStatus status);

    /**
     * Pagination par clé (keyset) : stable même si des lignes changent de statut pendant le parcours.
     */
    @Query("""
            select r from SeatReservation r
             where r.status = com.parentconnect.events.entity.SeatReservationStatus.ACTIVE
               and r.updatedAt <= :idleSince
               and (:afterId is null or r.id > :afterId)
             order by r.id asc
            """)
    List<SeatReservation> findActiveIdleSince(@Param("idleSince") LocalDateTime idleSince,
                                              @Param("afterId") UUID afterId,
                                              Pageable pageable);
}
