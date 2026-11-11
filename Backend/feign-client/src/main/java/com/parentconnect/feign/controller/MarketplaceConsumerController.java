package com.parentconnect.feign.controller;

import com.parentconnect.feign.client.MarketplaceFeignClient;
import com.parentconnect.feign.dto.BorrowListingRequest;
import com.parentconnect.feign.dto.CreateListingRequest;
import com.parentconnect.feign.dto.ListingDto;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Contrôleur REST démonstrateur
 * 
 * Permet au professeur de tester en direct qu'un microservice Spring Boot
 * appelle le microservice Marketplace via OpenFeign !
 */
@RestController
@RequestMapping("/api/consumer/marketplace")
public class MarketplaceConsumerController {

    private final MarketplaceFeignClient marketplaceFeignClient;

    public MarketplaceConsumerController(MarketplaceFeignClient marketplaceFeignClient) {
        this.marketplaceFeignClient = marketplaceFeignClient;
    }

    @GetMapping("/listings")
    public ResponseEntity<List<ListingDto>> getAllListings(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String status) {
        List<ListingDto> listings = marketplaceFeignClient.getAllListings(category, status);
        return ResponseEntity.ok(listings);
    }

    @GetMapping("/listings/{id}")
    public ResponseEntity<ListingDto> getListingById(@PathVariable String id) {
        ListingDto listing = marketplaceFeignClient.getListingById(id);
        return ResponseEntity.ok(listing);
    }

    @PostMapping("/listings")
    public ResponseEntity<ListingDto> createListing(@RequestBody CreateListingRequest request) {
        ListingDto created = marketplaceFeignClient.createListing(request);
        return ResponseEntity.ok(created);
    }

    @PostMapping("/listings/{id}/borrow")
    public ResponseEntity<ListingDto> borrowListing(
            @PathVariable String id,
            @RequestBody BorrowListingRequest request) {
        ListingDto borrowed = marketplaceFeignClient.borrowListing(id, request);
        return ResponseEntity.ok(borrowed);
    }
}
