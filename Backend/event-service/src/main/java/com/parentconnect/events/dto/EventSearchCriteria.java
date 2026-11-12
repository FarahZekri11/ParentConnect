package com.parentconnect.events.dto;

import com.parentconnect.events.entity.EventCategory;
import com.parentconnect.events.entity.EventStatus;

import java.time.LocalDate;

/**
 * Filtres de recherche d'événements (tous facultatifs).
 */
public record EventSearchCriteria(
        String city,
        EventCategory category,
        LocalDate dateFrom,
        LocalDate dateTo,
        Integer childAge,
        Double lat,
        Double lng,
        Double radiusKm,
        Boolean onlyAvailable,
        EventStatus status
) {

    public static final double DEFAULT_RADIUS_KM = 10.0;

    public boolean hasGeoFilter() {
        return lat != null && lng != null;
    }

    public double effectiveRadiusKm() {
        return radiusKm != null ? radiusKm : DEFAULT_RADIUS_KM;
    }
}
