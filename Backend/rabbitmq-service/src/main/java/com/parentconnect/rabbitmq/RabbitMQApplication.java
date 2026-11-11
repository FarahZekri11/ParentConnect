package com.parentconnect.rabbitmq;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * ParentConnect - Microservice RabbitMQ Spring AMQP
 * 
 * Illustre l'architecture orientée événements (Event-Driven)
 * avec RabbitMQ, Spring Boot, @RabbitListener et RabbitTemplate.
 */
@SpringBootApplication
public class RabbitMQApplication {

    public static void main(String[] args) {
        SpringApplication.run(RabbitMQApplication.class, args);
    }
}
