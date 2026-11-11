package com.parentconnect.discovery;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

/**
 * ParentConnect - Eureka Discovery Server
 * 
 * Provides centralized service registration and discovery for all microservices:
 * - marketplace-service (Port 3002)
 * - api-gateway (Port 8080)
 * - feign-client consumer services
 * - other business microservices
 */
@SpringBootApplication
@EnableEurekaServer
public class DiscoveryServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(DiscoveryServerApplication.class, args);
    }
}
