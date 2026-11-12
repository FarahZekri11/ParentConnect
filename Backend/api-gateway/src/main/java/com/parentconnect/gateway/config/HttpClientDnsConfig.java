package com.parentconnect.gateway.config;

import org.springframework.cloud.gateway.config.HttpClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Cache DNS court pour le client HTTP de la Gateway (Reactor Netty).
 * <p>
 * Par défaut, Netty garde la résolution nom → IP selon le TTL renvoyé par le DNS de Docker (600 s).
 * Or un microservice recréé (docker compose up --build) change d'adresse IP et Docker peut réattribuer
 * l'ancienne IP à un AUTRE conteneur : la Gateway enverrait alors les requêtes au mauvais service.
 * Limiter le cache à quelques secondes garantit un routage correct après chaque redéploiement.
 */
@Configuration
public class HttpClientDnsConfig {

    @Bean
    public HttpClientCustomizer shortDnsCacheCustomizer() {
        return httpClient -> httpClient.resolver(spec -> spec
                .cacheMaxTimeToLive(Duration.ofSeconds(5))
                .cacheNegativeTimeToLive(Duration.ofSeconds(1)));
    }
}
