package com.parentconnect.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.config.server.EnableConfigServer;

/**
 * Spring Cloud Config Server de ParentConnect.
 * <p>
 * Sert la configuration des microservices Spring depuis le dépôt natif {@code Backend/config-repo}
 * (monté en lecture seule dans le conteneur) : {@code GET /{application}/{profile}}.
 * Les secrets ne sont jamais placés dans ce dépôt : ils restent dans les variables d'environnement (.env).
 */
@SpringBootApplication
@EnableConfigServer
public class ConfigServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}
