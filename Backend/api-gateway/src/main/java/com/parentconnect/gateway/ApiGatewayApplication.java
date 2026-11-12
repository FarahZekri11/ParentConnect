package com.parentconnect.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * ParentConnect - Spring Cloud API Gateway
 * 
 * Features:
 * 1. Centralized routing for microservices
 * 2. Eureka dynamic service discovery
 * 3. Sécurisation d'une API Gateway avec Keycloak (OAuth2 Resource Server)
 * 4. Token Relay (forwarding JWT token downstream)
 */
@SpringBootApplication
@EnableDiscoveryClient
public class ApiGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApplication.class, args);
    }
}
