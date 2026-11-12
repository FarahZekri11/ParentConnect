package com.parentconnect.participations;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableFeignClients
@ConfigurationPropertiesScan
@EnableScheduling
public class ParticipationServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(ParticipationServiceApplication.class, args);
    }
}
