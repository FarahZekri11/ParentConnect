package com.parentconnect.events.support;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Fabrique des JWT identiques à ceux de Keycloak (realm parentconnect) : RS256, sub, preferred_username,
 * realm_access.roles. La clé publique correspondante est injectée dans KEYCLOAK_REALM_PUBLIC_KEY pour les tests.
 */
public final class TestJwtFactory {

    private static final KeyPair REALM_KEYS = generateRsaKeyPair();
    private static final KeyPair FOREIGN_KEYS = generateRsaKeyPair();

    private TestJwtFactory() {
    }

    /** Valeur « Public key » telle que Keycloak l'affiche (Base64 X.509). */
    public static String realmPublicKeyBase64() {
        return Base64.getEncoder().encodeToString(REALM_KEYS.getPublic().getEncoded());
    }

    public static String token(UUID userId, String... roles) {
        return rs256(REALM_KEYS, userId, Instant.now().plusSeconds(3600), roles);
    }

    public static String expiredToken(UUID userId, String... roles) {
        return rs256(REALM_KEYS, userId, Instant.now().minusSeconds(3600), roles);
    }

    /** Token RS256 signé par une autre clé que celle du realm (signature falsifiée). */
    public static String forgedToken(UUID userId, String... roles) {
        return rs256(FOREIGN_KEYS, userId, Instant.now().plusSeconds(3600), roles);
    }

    /** Token HS256 (format de démonstration) : refusé hors profil dev. */
    public static String hs256Token(String secret, UUID userId, String... roles) {
        var encoder = new NimbusJwtEncoder(new ImmutableSecret<>(
                new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")));
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                claims(userId, Instant.now().plusSeconds(3600), roles))).getTokenValue();
    }

    /** Token RS256 valide dont le claim sub est une valeur quelconque (ex. non UUID). */
    public static String tokenWithSubject(String subject, String... roles) {
        return rs256(REALM_KEYS, subject, Instant.now().plusSeconds(3600), roles);
    }

    public static String bearer(UUID userId, String... roles) {
        return "Bearer " + token(userId, roles);
    }

    private static String rs256(KeyPair keys, UUID userId, Instant expiresAt, String... roles) {
        return rs256(keys, userId.toString(), expiresAt, roles);
    }

    private static String rs256(KeyPair keys, String subject, Instant expiresAt, String... roles) {
        RSAKey jwk = new RSAKey.Builder((RSAPublicKey) keys.getPublic())
                .privateKey((RSAPrivateKey) keys.getPrivate())
                .keyID("parentconnect-test")
                .build();
        var encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(jwk)));
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).build(),
                claims(subject, expiresAt, roles))).getTokenValue();
    }

    private static JwtClaimsSet claims(UUID userId, Instant expiresAt, String... roles) {
        return claims(userId.toString(), expiresAt, roles);
    }

    private static JwtClaimsSet claims(String subject, Instant expiresAt, String... roles) {
        return JwtClaimsSet.builder()
                .issuer("http://keycloak:8080/realms/parentconnect")
                .subject(subject)
                .claim("preferred_username", "user-" + subject.substring(0, Math.min(8, subject.length())))
                .claim("realm_access", Map.of("roles",
                        concat(List.of(roles), List.of("offline_access", "default-roles-parentconnect"))))
                .issuedAt(expiresAt.minusSeconds(7200))
                .expiresAt(expiresAt)
                .build();
    }

    private static List<String> concat(List<String> a, List<String> b) {
        return java.util.stream.Stream.concat(a.stream(), b.stream()).toList();
    }

    private static KeyPair generateRsaKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
