package com.parentconnect.participations.controller;

import com.parentconnect.participations.entity.ParticipationStatus;
import com.parentconnect.participations.repository.ParticipationRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * GET /api/admin/participations/stats (ADMIN) : compteurs réels pour le tableau de bord administrateur.
 * Appelé par l'API Gateway (agrégation des statistiques) ; aucune donnée personnelle n'est renvoyée.
 */
@RestController
@RequestMapping("/api/admin/participations")
@RequiredArgsConstructor
@Tag(name = "Administration", description = "Statistiques du module Participation")
public class AdminStatsController {

    private final ParticipationRepository repository;

    @GetMapping("/stats")
    @Operation(summary = "Statistiques des participations (ADMIN)")
    public Map<String, Long> stats() {
        Map<String, Long> stats = new LinkedHashMap<>();
        stats.put("confirmed", repository.countByStatus(ParticipationStatus.CONFIRMED));
        stats.put("cancelled", repository.countByStatus(ParticipationStatus.CANCELLED));
        stats.put("participating_parents", repository.countDistinctUsersByStatus(ParticipationStatus.CONFIRMED));
        stats.put("children_registered", repository.sumChildrenByStatus(ParticipationStatus.CONFIRMED));
        return stats;
    }
}
