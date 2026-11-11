package com.parentconnect.security;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * ParentConnect - Microservice démonstrateur de sécurisation avec Keycloak
 * 
 * Illustre:
 * 1. La configuration de Spring Security Resource Server
 * 2. L'extraction des rôles Keycloak (realm_access.roles)
 * 3. Le contrôle d'accès basé sur les rôles (RBAC) via @PreAuthorize
 */
@SpringBootApplication
public class KeycloakSecurityApplication {

    public static void main(String[] args) {
        SpringApplication.run(KeycloakSecurityApplication.class, args);
    }
}
