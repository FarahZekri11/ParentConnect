package com.parentconnect.participations.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Paramètres de validation des JWT.
 *
 * <ul>
 *   <li><b>Production / intégration</b> : tokens Keycloak signés en RS256, vérifiés avec la clé publique
 *       RSA du realm {@code parentconnect} (variable {@code KEYCLOAK_REALM_PUBLIC_KEY}).</li>
 *   <li><b>Profil dev uniquement</b> : tokens de démonstration HS256 signés avec {@code JWT_SECRET}
 *       (endpoint {@code GET /dev/tokens}). Jamais acceptés hors profil dev.</li>
 * </ul>
 *
 * @param keycloakPublicKey clé publique RSA du realm (Base64 « Public key » de Keycloak, ou PEM)
 * @param issuer            émetteur attendu (claim "iss"), facultatif — ex. http://keycloak:8080/realms/parentconnect
 * @param userIdClaim       claim de l'identifiant utilisateur (défaut "sub" ; "preferred_username" en repli)
 * @param rolesClaimPath    chemin JSON des rôles (défaut "realm_access.roles")
 * @param clockSkewSeconds  tolérance d'horloge pour exp/nbf
 * @param devTokensEnabled  active les tokens HS256 de démonstration (profil dev uniquement)
 * @param devSecret         secret HS256 des tokens de démonstration (JWT_SECRET)
 */
@ConfigurationProperties(prefix = "security.jwt")
public record JwtProperties(
        String keycloakPublicKey,
        String issuer,
        String userIdClaim,
        String rolesClaimPath,
        Long clockSkewSeconds,
        boolean devTokensEnabled,
        String devSecret
) {

    public JwtProperties {
        userIdClaim = (userIdClaim == null || userIdClaim.isBlank()) ? "sub" : userIdClaim.trim();
        rolesClaimPath = (rolesClaimPath == null || rolesClaimPath.isBlank()) ? "realm_access.roles" : rolesClaimPath.trim();
        clockSkewSeconds = clockSkewSeconds == null ? 30L : clockSkewSeconds;
    }

    public boolean hasKeycloakKey() {
        return keycloakPublicKey != null && !keycloakPublicKey.isBlank();
    }

    public boolean hasDevSecret() {
        return devTokensEnabled && devSecret != null && !devSecret.isBlank();
    }
}
