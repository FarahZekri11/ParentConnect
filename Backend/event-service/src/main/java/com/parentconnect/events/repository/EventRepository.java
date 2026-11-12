package com.parentconnect.events.repository;

import com.parentconnect.events.entity.Event;
import com.parentconnect.events.entity.EventStatus;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface EventRepository extends JpaRepository<Event, UUID>, JpaSpecificationExecutor<Event> {

    /**
     * Charge l'événement avec un verrou pessimiste (SELECT ... FOR UPDATE).
     * Toutes les opérations qui modifient la capacité ou les places réservées passent par cette méthode,
     * ce qui sérialise les réservations concurrentes sur un même événement.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "5000"))
    @Query("select e from Event e where e.id = :id")
    Optional<Event> findByIdForUpdate(@Param("id") UUID id);

    Page<Event> findByOrganizerId(UUID organizerId, Pageable pageable);

    Page<Event> findByOrganizerIdAndStatus(UUID organizerId, EventStatus status, Pageable pageable);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Event e
               set e.status = com.parentconnect.events.entity.EventStatus.COMPLETED,
                   e.updatedAt = :now,
                   e.version = e.version + 1
             where e.status = com.parentconnect.events.entity.EventStatus.PUBLISHED
               and e.endDateTime < :now
            """)
    int markFinishedEventsAsCompleted(@Param("now") LocalDateTime now);
}
