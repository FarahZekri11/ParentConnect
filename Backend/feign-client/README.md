# ParentConnect — Client OpenFeign & Intégration Inter-Services

Ce dossier contient la spécification et l'implémentation complète du client **OpenFeign** permettant aux autres microservices de la plateforme (**User Service**, **Babysitting Service**, **Notification Service**) de consommer le microservice **Marketplace** de façon synchrone, déclarative et sécurisée par **Keycloak**.

---

## 1. Principe de Fonctionnement d'OpenFeign

Dans l'architecture Spring Cloud de **ParentConnect** :
1. **Résolution Dynamique de Service** : Le client déclare `@FeignClient(name = "marketplace-service")`. Feign interroge automatiquement le registre **Eureka (port 8761)** pour obtenir l'adresse IP et le port du microservice Marketplace (`localhost:3002`).
2. **Contrat d'API Fortement Typé** : Les requêtes HTTP REST (`GET /api/listings`, `POST /api/listings`) sont encapsulées dans une interface Java sans nécessiter de code `RestTemplate` ou `WebClient` verbeux.
3. **Sécurité & Token Relay (Keycloak)** : L'intercepteur `FeignKeycloakInterceptor` extrait le jeton Bearer JWT Keycloak du contexte de sécurité Spring et l'injecte dans chaque requête sortante.

---

## 2. Structure des Fichiers

| Fichier | Description |
| :--- | :--- |
| [`MarketplaceClient.java`](./MarketplaceClient.java) | Interface `@FeignClient` déclarant l'ensemble des méthodes synchrones du Marketplace. |
| [`FeignKeycloakInterceptor.java`](./FeignKeycloakInterceptor.java) | Intercepteur Feign qui réalise la propagation du jeton Keycloak (`Token Relay`) et des headers `x-user-id`. |
| [`dto/ListingDto.java`](./dto/ListingDto.java) | Modèle de données Java représentant une annonce de matériel bébé. |
| [`dto/CreateListingRequest.java`](./dto/CreateListingRequest.java) | DTO de création d'annonce (titre, catégorie, type, prix, état). |
| [`dto/BorrowListingRequest.java`](./dto/BorrowListingRequest.java) | DTO pour l'emprunt d'un matériel disponible en prêt (`LENDING`). |
| [`dto/ListingsResponse.java`](./dto/ListingsResponse.java) | Réponse paginée de recherche d'annonces. |

---

## 3. Configuration dans un Microservice Client (Spring Boot)

### A. Dépendances `pom.xml`
```xml
<dependencies>
    <!-- Spring Cloud OpenFeign -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-openfeign</artifactId>
    </dependency>

    <!-- Eureka Client pour la découverte du nom "marketplace-service" -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
    </dependency>

    <!-- Spring Security & Keycloak Resource Server -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
    </dependency>
</dependencies>
```

### B. Activation dans la classe principale Spring Boot
```java
@SpringBootApplication
@EnableFeignClients(basePackages = "com.parentconnect.feign")
public class UserServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }
}
```

### C. Exemple d'utilisation dans un Service métier
```java
@Service
public class ParentDashboardService {

    @Autowired
    private MarketplaceClient marketplaceClient;

    public void displayParentDashboard(String parentId) {
        // Appel synchrone via OpenFeign vers le microservice Marketplace
        ListingsResponse response = marketplaceClient.getListings("STROLLERS", null, null, 1, 5);

        System.out.println("Poussettes disponibles trouvées : " + response.getTotal());
        for (ListingDto item : response.getListings()) {
            System.out.println(" - " + item.getTitle() + " (" + item.getPrice() + " EUR)");
        }
    }
}
```

---

## 4. Ce que vous expliquez à votre enseignant lors de la soutenance :

> *"Pour la communication synchrone entre nos microservices, nous utilisons **Spring Cloud OpenFeign**.  
> Le client `@FeignClient(name = "marketplace-service")` interroge **Eureka** pour localiser mon microservice Marketplace sur le port `3002`.  
> Pour la sécurité, nous avons configuré un intercepteur `FeignKeycloakInterceptor` qui applique le pattern **Token Relay** : il récupère le jeton JWT Keycloak de l'utilisateur connecté et l'injecte automatiquement dans l'en-tête `Authorization: Bearer <token>` de l'appel inter-service, garantissant une sécurité de bout en bout !"*
