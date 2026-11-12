package com.parentconnect.events.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.boot.actuate.health.Status;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Santé publique (sans authentification) pour l'API Gateway, Eureka et l'orchestrateur Docker.
 * 200 si le service et sa base de données sont opérationnels, 503 sinon.
 */
@RestController
@Tag(name = "Santé", description = "Endpoint de santé public")
public class HealthController {

    private final HealthEndpoint healthEndpoint;
    private final String serviceName;

    public HealthController(HealthEndpoint healthEndpoint, @Value("${spring.application.name}") String serviceName) {
        this.healthEndpoint = healthEndpoint;
        this.serviceName = serviceName;
    }

    @GetMapping({"/api/health", "/health"})
    @SecurityRequirements
    @Operation(summary = "État de santé du service (public)")
    public ResponseEntity<Map<String, String>> health() {
        Status status = healthEndpoint.health().getStatus();
        HttpStatus httpStatus = Status.UP.equals(status) ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
        return ResponseEntity.status(httpStatus).body(Map.of("status", status.getCode(), "service", serviceName));
    }
}
