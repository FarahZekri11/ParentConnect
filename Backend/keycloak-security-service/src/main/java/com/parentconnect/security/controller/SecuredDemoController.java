package com.parentconnect.security.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * Contrôleur sécurisé avec RBAC Keycloak
 */
@RestController
@RequestMapping("/api")
public class SecuredDemoController {

    @GetMapping("/public/info")
    public ResponseEntity<Map<String, String>> publicEndpoint() {
        Map<String, String> response = new HashMap<>();
        response.put("message", "Cet endpoint est public, accessible sans token Keycloak.");
        return ResponseEntity.ok(response);
    }

    @GetMapping("/user/profile")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> userProfile(@AuthenticationPrincipal Jwt jwt) {
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Accès autorisé pour le rôle USER ou ADMIN.");
        response.put("username", jwt.getClaimAsString("preferred_username"));
        response.put("email", jwt.getClaimAsString("email"));
        response.put("subjectId", jwt.getSubject());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/admin/dashboard")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> adminDashboard(@AuthenticationPrincipal Jwt jwt) {
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Accès restreint STRICTEMENT réservé aux administrateurs (ROLE_ADMIN).");
        response.put("adminUser", jwt.getClaimAsString("preferred_username"));
        return ResponseEntity.ok(response);
    }
}
