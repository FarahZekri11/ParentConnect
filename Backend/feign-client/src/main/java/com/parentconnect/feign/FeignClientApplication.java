package com.parentconnect.feign;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * ParentConnect - Microservice démonstrateur OpenFeign
 * 
 * Illustre la communication synchrone inter-microservices en utilisant
 * l'annotation @EnableFeignClients et @FeignClient.
 */
@SpringBootApplication
@EnableFeignClients
@EnableDiscoveryClient
public class FeignClientApplication {

    public static void main(String[] args) {
        SpringApplication.run(FeignClientApplication.class, args);
    }
}
