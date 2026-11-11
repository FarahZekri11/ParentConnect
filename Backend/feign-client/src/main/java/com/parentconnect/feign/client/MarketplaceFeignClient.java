package com.parentconnect.feign.client;

import com.parentconnect.feign.config.FeignKeycloakInterceptor;
import com.parentconnect.feign.dto.*;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Interface declarative OpenFeign pour consommer le microservice Marketplace.
 * 
 * - name: nom d'enregistrement Eureka ("marketplace-service")
 * - url: fallback direct si Eureka n'est pas utilisé ("http://localhost:3002")
 * - configuration: injecte automatiquement le token Bearer Keycloak (Token Relay)
 */
@FeignClient(
    name = "marketplace-service",
    url = "${marketplace.service.url:http://localhost:3002}",
    configuration = FeignKeycloakInterceptor.class
)
public interface MarketplaceFeignClient {

    /**
     * GET /api/listings : Récupère la liste de toutes les annonces
     */
    @GetMapping("/api/listings")
    List<ListingDto> getAllListings(
        @RequestParam(value = "category", required = false) String category,
        @RequestParam(value = "status", required = false) String status
    );

    /**
     * GET /api/listings/{id} : Récupère le détail d'une annonce par son ID
     */
    @GetMapping("/api/listings/{id}")
    ListingDto getListingById(@PathVariable("id") String id);

    /**
     * POST /api/listings : Crée une nouvelle annonce (Protégé par Token Keycloak)
     */
    @PostMapping("/api/listings")
    ListingDto createListing(@RequestBody CreateListingRequest request);

    /**
     * PUT /api/listings/{id} : Modifie une annonce existante (Protégé)
     */
    @PutMapping("/api/listings/{id}")
    ListingDto updateListing(@PathVariable("id") String id, @RequestBody CreateListingRequest request);

    /**
     * DELETE /api/listings/{id} : Supprime une annonce (Protégé)
     */
    @DeleteMapping("/api/listings/{id}")
    void deleteListing(@PathVariable("id") String id);

    /**
     * POST /api/listings/{id}/borrow : Emprunte un article (Protégé)
     */
    @PostMapping("/api/listings/{id}/borrow")
    ListingDto borrowListing(@PathVariable("id") String id, @RequestBody BorrowListingRequest request);

    /**
     * POST /api/listings/{id}/return : Retourne un article emprunté (Protégé)
     */
    @PostMapping("/api/listings/{id}/return")
    ListingDto returnListing(@PathVariable("id") String id);
}
