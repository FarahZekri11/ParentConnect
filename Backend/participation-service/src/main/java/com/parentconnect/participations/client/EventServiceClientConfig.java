package com.parentconnect.participations.client;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class EventServiceClientConfig {

    @Bean
    public RestClient eventServiceRestClient(RestClient.Builder builder, EventServiceProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.connectTimeout());
        requestFactory.setReadTimeout(properties.readTimeout());
        return builder
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .defaultHeader(EventServiceProperties.API_KEY_HEADER, properties.apiKey())
                // Propagation du token de l'utilisateur vers Event Service
                .requestInterceptor(new AuthorizationPropagationInterceptor())
                .build();
    }
}
