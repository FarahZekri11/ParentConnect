package com.parentconnect.events.security;

import java.util.Set;
import java.util.UUID;

/**
 * Utilisateur authentifié, déduit exclusivement du JWT validé.
 */
public record CurrentUser(UUID userId, Set<String> roles) {

    public boolean isAdmin() {
        return roles.contains(Roles.ADMIN);
    }

    public boolean hasRole(String role) {
        return roles.contains(role);
    }
}
