package com.parentconnect.discovery;

import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * Répond 200 sur l'URL de base d'Eureka ({@code GET /eureka} et {@code GET /eureka/}).
 * <p>
 * Le serveur Eureka de Spring Cloud ne sert rien à cette adresse (404), alors que certains clients
 * non-Java de l'équipe (services Laravel du module Communauté) l'interrogent pour savoir si Eureka
 * est disponible avant de s'enregistrer. Filtre placé avant celui de Jersey ; toutes les autres
 * requêtes (API Eureka /eureka/apps/...) passent sans modification.
 */
@Configuration
public class EurekaRootStatusFilterConfig {

    @Bean
    public FilterRegistrationBean<Filter> eurekaRootStatusFilter() {
        Filter filter = (request, response, chain) -> {
            HttpServletRequest http = (HttpServletRequest) request;
            String path = http.getRequestURI().substring(http.getContextPath().length());
            if ("GET".equals(http.getMethod()) && ("/eureka".equals(path) || "/eureka/".equals(path))) {
                HttpServletResponse out = (HttpServletResponse) response;
                out.setStatus(HttpServletResponse.SC_OK);
                out.setContentType("application/json");
                out.getWriter().write("{\"status\":\"UP\",\"service\":\"discovery-server\"}");
                return;
            }
            chain.doFilter(request, response);
        };
        FilterRegistrationBean<Filter> registration = new FilterRegistrationBean<>(filter);
        registration.addUrlPatterns("/eureka", "/eureka/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }
}
