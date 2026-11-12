# ParentConnect — Architecture Microservices Spring Cloud & Java

Ce dossier regroupe l'ensemble des composants d'infrastructure et de services développés avec **Spring Boot / Spring Cloud (Java)** et **NestJS (TypeScript)** selon les standards académiques universitaires.

---

## 🏛️ Structure des Projets Java & Spring Boot

```
Backend/
├── pom.xml                        <-- Parent POM multi-modules Maven
│
├── discovery-server/              <-- 1. Eureka Discovery Server (Port 8761)
│   ├── pom.xml                    (spring-cloud-starter-netflix-eureka-server)
│   └── src/main/java/com/parentconnect/discovery/
│       └── DiscoveryServerApplication.java (@EnableEurekaServer)
│
├── api-gateway/                   <-- 2. Spring Cloud Gateway + Keycloak (Port 8080)
│   ├── pom.xml                    (spring-cloud-starter-gateway + oauth2-resource-server)
│   └── src/main/java/com/parentconnect/gateway/
│       ├── ApiGatewayApplication.java (@EnableDiscoveryClient)
│       └── config/SecurityConfig.java (Sécurisation Reactive WebFlux Keycloak)
│
├── feign-client/                  <-- 3. OpenFeign Synchronous Client (Port 8082)
│   ├── pom.xml                    (spring-cloud-starter-openfeign)
│   └── src/main/java/com/parentconnect/feign/
│       ├── FeignClientApplication.java (@EnableFeignClients)
│       ├── client/MarketplaceFeignClient.java (Interface déclarative @FeignClient)
│       ├── config/FeignKeycloakInterceptor.java (Token Relay vers Marketplace)
│       └── controller/MarketplaceConsumerController.java (Point d'accès REST de test)
│
├── rabbitmq-service/              <-- 4. Spring AMQP RabbitMQ (Port 8083)
│   ├── pom.xml                    (spring-boot-starter-amqp)
│   └── src/main/java/com/parentconnect/rabbitmq/
│       ├── RabbitMQApplication.java
│       ├── config/RabbitMQConfig.java (Exchange, Queue, Binding, Jackson JSON)
│       ├── consumer/MarketplaceEventConsumer.java (@RabbitListener)
│       ├── producer/MarketplaceEventProducer.java (RabbitTemplate)
│       └── controller/RabbitMQEventController.java (/api/events/publish & /received)
│
├── keycloak-security-service/     <-- 5. Sécurisation Microservice Keycloak (Port 8084)
│   ├── pom.xml                    (spring-boot-starter-oauth2-resource-server)
│   └── src/main/java/com/parentconnect/security/
│       ├── KeycloakSecurityApplication.java
│       ├── config/SecurityConfig.java (SecurityFilterChain sans état)
│       ├── config/KeycloakJwtAuthenticationConverter.java (Mapping des rôles realm_access)
│       └── controller/SecuredDemoController.java (@PreAuthorize("hasRole('ADMIN')"))
│
└── marketplace-service/           <-- Microservice Métier Marketplace (NestJS + MongoDB, Port 3002)
```

---

## 🚀 Comment ouvrir et exécuter dans IntelliJ IDEA

1. Ouvrez **IntelliJ IDEA**.
2. Cliquez sur **File > Open...** et sélectionnez le dossier `ParentConnect/Backend`.
3. IntelliJ détecte automatiquement le fichier [`Backend/pom.xml`](pom.xml) et charge les 5 projets Java comme modules Maven.
4. Vous pouvez exécuter n'importe quel microservice en faisant un clic droit sur sa classe principale `Application.java` puis **Run**.
