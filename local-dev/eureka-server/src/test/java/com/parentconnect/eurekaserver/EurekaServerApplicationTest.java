package com.parentconnect.eurekaserver;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class EurekaServerApplicationTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void dashboardAndHealthAreAvailable() {
        assertThat(restTemplate.getForEntity("/", String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restTemplate.getForEntity("/actuator/health", String.class).getBody()).contains("\"UP\"");
    }
}
