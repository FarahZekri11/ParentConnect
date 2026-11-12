package com.parentconnect.participations.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Génère des JWT de démonstration au format des tokens Keycloak (sub, preferred_username, realm_access.roles),
 * signés en HS256 avec JWT_SECRET.
 * <b>Profil "dev" uniquement</b> : ce bean n'existe pas en production et ces tokens n'y sont jamais acceptés.
 * La sécurité n'est jamais désactivée : les tokens produits passent par la validation standard.
 */
@Service
@Profile("dev")
public class DevJwtTokenService {

    private final NimbusJwtEncoder encoder;

    public DevJwtTokenService(JwtProperties properties) {
        if (!properties.hasDevSecret()) {
            throw new IllegalStateException("Profil dev : JWT_SECRET doit être défini pour générer des tokens de démonstration");
        }
        byte[] secret = properties.devSecret().getBytes(StandardCharsets.UTF_8);
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(new SecretKeySpec(secret, "HmacSHA256")));
    }

    public IssuedToken issue(UUID userId, List<String> roles, Duration validity) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(validity);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("parentconnect-dev")
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(expiresAt)
                .claim("preferred_username", userId.toString())
                .claim("realm_access", Map.of("roles", roles))
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), claims)).getTokenValue();
        return new IssuedToken(token, "Bearer", expiresAt, userId, roles);
    }

    public record IssuedToken(String accessToken, String tokenType, Instant expiresAt, UUID userId, List<String> roles) {
    }
}
