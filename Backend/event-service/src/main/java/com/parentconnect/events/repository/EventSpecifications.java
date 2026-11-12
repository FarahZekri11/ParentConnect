package com.parentconnect.events.repository;

import com.parentconnect.events.dto.EventSearchCriteria;
import com.parentconnect.events.entity.Event;
import com.parentconnect.events.entity.EventStatus;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Construction dynamique des filtres de recherche d'événements.
 */
public final class EventSpecifications {

    public static final double EARTH_RADIUS_KM = 6371.0;

    private EventSpecifications() {
    }

    public static Specification<Event> fromCriteria(EventSearchCriteria criteria, LocalDateTime now) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            EventStatus status = criteria.status() != null ? criteria.status() : EventStatus.PUBLISHED;
            predicates.add(cb.equal(root.get("status"), status));

            if (criteria.city() != null && !criteria.city().isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("city")), criteria.city().trim().toLowerCase()));
            }
            if (criteria.q() != null && !criteria.q().isBlank()) {
                // Recherche textuelle insensible à la casse dans le titre, la description, le lieu et la ville
                String pattern = "%" + criteria.q().trim().toLowerCase()
                        .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.<String>get("title")), pattern, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.<String>get("description"), "")), pattern, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.<String>get("locationName"), "")), pattern, '\\'),
                        cb.like(cb.lower(root.<String>get("city")), pattern, '\\')));
            }
            if (criteria.category() != null) {
                predicates.add(cb.equal(root.get("category"), criteria.category()));
            }
            if (criteria.dateFrom() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startDateTime"), criteria.dateFrom().atStartOfDay()));
            }
            if (criteria.dateTo() != null) {
                predicates.add(cb.lessThan(root.get("startDateTime"), criteria.dateTo().plusDays(1).atStartOfDay()));
            }
            if (criteria.childAge() != null) {
                Integer age = criteria.childAge();
                predicates.add(cb.or(cb.isNull(root.get("minChildAge")), cb.lessThanOrEqualTo(root.get("minChildAge"), age)));
                predicates.add(cb.or(cb.isNull(root.get("maxChildAge")), cb.greaterThanOrEqualTo(root.get("maxChildAge"), age)));
            }
            if (Boolean.TRUE.equals(criteria.onlyAvailable())) {
                predicates.add(cb.lessThan(root.get("reservedPlaces"), root.get("capacity")));
                predicates.add(cb.greaterThan(root.get("startDateTime"), now));
            }
            if (criteria.hasGeoFilter()) {
                predicates.add(cb.isNotNull(root.get("latitude")));
                predicates.add(cb.isNotNull(root.get("longitude")));
                predicates.add(cb.lessThanOrEqualTo(
                        haversineDistanceKm(root, cb, criteria.lat(), criteria.lng()),
                        criteria.effectiveRadiusKm()));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    /**
     * Distance en kilomètres entre le point (lat, lng) et l'événement, selon la formule de Haversine :
     * d = 2R · asin( sqrt( sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2) ) ).
     * Calculée par PostgreSQL afin de filtrer et paginer directement en base.
     */
    static Expression<Double> haversineDistanceKm(Root<Event> root, CriteriaBuilder cb, double lat, double lng) {
        double lat1 = Math.toRadians(lat);
        double lng1 = Math.toRadians(lng);

        Expression<Double> lat2 = cb.function("radians", Double.class, root.get("latitude"));
        Expression<Double> lng2 = cb.function("radians", Double.class, root.get("longitude"));

        Expression<Double> sinHalfDeltaLat = cb.function("sin", Double.class,
                toDouble(cb.quot(cb.diff(lat2, lat1), 2.0)));
        Expression<Double> sinHalfDeltaLng = cb.function("sin", Double.class,
                toDouble(cb.quot(cb.diff(lng2, lng1), 2.0)));

        Expression<Double> a = toDouble(cb.sum(
                cb.prod(sinHalfDeltaLat, sinHalfDeltaLat),
                cb.prod(cb.prod(cb.function("cos", Double.class, cb.literal(lat1)),
                                cb.function("cos", Double.class, lat2)),
                        cb.prod(sinHalfDeltaLng, sinHalfDeltaLng))));

        // least(1, a) protège asin des erreurs d'arrondi flottant (a légèrement > 1)
        Expression<Double> boundedA = cb.function("least", Double.class, cb.literal(1.0), a);
        Expression<Double> c = cb.function("asin", Double.class, cb.function("sqrt", Double.class, boundedA));
        return toDouble(cb.prod(c, 2.0 * EARTH_RADIUS_KM));
    }

    @SuppressWarnings("unchecked")
    private static Expression<Double> toDouble(Expression<? extends Number> expression) {
        return (Expression<Double>) expression;
    }

    /** Équivalent Java de la formule, utilisé pour les réponses et les tests. */
    public static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1.0, a)));
    }
}
