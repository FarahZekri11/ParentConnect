package com.parentconnect.participations.repository;

import com.parentconnect.participations.entity.Participation;
import com.parentconnect.participations.entity.ParticipationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ParticipationRepository extends JpaRepository<Participation, UUID> {

    Optional<Participation> findByEventIdAndUserId(UUID eventId, UUID userId);

    Page<Participation> findByUserId(UUID userId, Pageable pageable);

    Page<Participation> findByUserIdAndStatus(UUID userId, ParticipationStatus status, Pageable pageable);

    Page<Participation> findByEventIdAndStatus(UUID eventId, ParticipationStatus status, Pageable pageable);

    long countByEventIdAndStatus(UUID eventId, ParticipationStatus status);

    long countByStatus(ParticipationStatus status);

    @Query("select count(distinct p.userId) from Participation p where p.status = :status")
    long countDistinctUsersByStatus(@Param("status") ParticipationStatus status);

    @Query("select coalesce(sum(p.childrenCount), 0) from Participation p where p.status = :status")
    long sumChildrenByStatus(@Param("status") ParticipationStatus status);

    @Query("select p from Participation p where p.eventId in :eventIds and p.userId in :userIds")
    List<Participation> findAllByEventIdInAndUserIdIn(@Param("eventIds") Collection<UUID> eventIds,
                                                      @Param("userIds") Collection<UUID> userIds);
}
