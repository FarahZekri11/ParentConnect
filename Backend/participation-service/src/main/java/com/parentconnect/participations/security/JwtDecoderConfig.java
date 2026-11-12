package com.parentconnect.participations.security;

import com.nimbusds.jwt.JWTParser;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.text.ParseException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;

/**
 * Validation locale des JWT (aucun appel réseau à Keycloak) :
 * <ul>
 *   <li>RS256 : signature vérifiée avec la clé publique du realm Keycloak {@code parentconnect} ;</li>
 *   <li>HS256 : uniquement en profil dev (tokens de démonstration de {@code GET /dev/tokens}).</li>
 * </ul>
 * Dans tous les cas : expiration obligatoire, nbf vérifié, émetteur vérifié s'il est configuré.
 * Ce service n'émet jamais de JWT en production.
 */
@Configuration
public class JwtDecoderConfig {

    public static final int MIN_HMAC_KEY_BYTES = 32;

    @Bean
    public JwtDecoder jwtDecoder(JwtProperties properties) {
        JwtDecoder rs256 = null;
        JwtDecoder hs256 = null;

        if (properties.hasKeycloakKey()) {
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(parseRsaPublicKey(properties.keycloakPublicKey()))
                    .signatureAlgorithm(SignatureAlgorithm.RS256)
                    .build();
            decoder.setJwtValidator(validators(properties, true));
            rs256 = decoder;
        }
        if (properties.hasDevSecret()) {
            byte[] secret = properties.devSecret().getBytes(StandardCharsets.UTF_8);
            if (secret.length < MIN_HMAC_KEY_BYTES) {
                throw new IllegalStateException("JWT_SECRET trop court : au moins 32 octets sont requis pour HS256");
            }
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(new SecretKeySpec(secret, "HmacSHA256"))
                    .macAlgorithm(MacAlgorithm.HS256)
                    .build();
            decoder.setJwtValidator(validators(properties, false));
            hs256 = decoder;
        }
        if (rs256 == null && hs256 == null) {
            throw new IllegalStateException("Aucune clé de validation JWT : définir KEYCLOAK_REALM_PUBLIC_KEY "
                    + "(clé publique RSA du realm Keycloak parentconnect), ou activer le profil dev avec JWT_SECRET");
        }
        return new AlgorithmDelegatingJwtDecoder(rs256, hs256);
    }

    private static OAuth2TokenValidator<Jwt> validators(JwtProperties properties, boolean checkIssuer) {
        List<OAuth2TokenValidator<Jwt>> validators = new ArrayList<>();
        validators.add(new JwtTimestampValidator(Duration.ofSeconds(properties.clockSkewSeconds())));
        validators.add(new JwtClaimValidator<>(JwtClaimNames.EXP, Objects::nonNull));
        if (checkIssuer && properties.issuer() != null && !properties.issuer().isBlank()) {
            validators.add(new JwtIssuerValidator(properties.issuer().trim()));
        }
        return new DelegatingOAuth2TokenValidator<>(validators);
    }

    /**
     * Accepte la valeur « Public key » affichée par Keycloak (Realm settings → Keys → RS256), c'est-à-dire
     * le Base64 de la structure X.509 SubjectPublicKeyInfo, avec ou sans en-têtes PEM.
     */
    static RSAPublicKey parseRsaPublicKey(String value) {
        try {
            String base64 = value
                    .replace("-----BEGIN PUBLIC KEY-----", "")
                    .replace("-----END PUBLIC KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(base64);
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception ex) {
            throw new IllegalStateException("KEYCLOAK_REALM_PUBLIC_KEY invalide : une clé publique RSA encodée en Base64 "
                    + "(Keycloak → Realm settings → Keys → RS256 → Public key) est attendue", ex);
        }
    }

    /** Choisit le validateur selon l'algorithme annoncé par l'en-tête du token ; tout autre algorithme est refusé. */
    static final class AlgorithmDelegatingJwtDecoder implements JwtDecoder {

        private final JwtDecoder rs256;
        private final JwtDecoder hs256;

        AlgorithmDelegatingJwtDecoder(JwtDecoder rs256, JwtDecoder hs256) {
            this.rs256 = rs256;
            this.hs256 = hs256;
        }

        @Override
        public Jwt decode(String token) {
            String algorithm;
            try {
                algorithm = JWTParser.parse(token).getHeader().getAlgorithm().getName();
            } catch (ParseException | RuntimeException ex) {
                throw new BadJwtException("Token JWT mal formé", ex);
            }
            if ("RS256".equals(algorithm) && rs256 != null) {
                return rs256.decode(token);
            }
            if ("HS256".equals(algorithm) && hs256 != null) {
                return hs256.decode(token);
            }
            throw new BadJwtException("Algorithme de signature non accepté : " + algorithm);
        }
    }
}
