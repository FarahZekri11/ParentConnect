# Eureka Server

> **Développement local uniquement.** En intégration, le serveur Eureka partagé est fourni par l'intégrateur (voir `INTEGRATION.md`).

Annuaire des microservices ParentConnect (Spring Cloud Netflix Eureka).

- Port : **8761** — tableau de bord : http://localhost:8761
- Image Docker : `parentconnect-eureka:1.0`
- Spring Boot 3.5.16 / Spring Cloud 2025.0.2

Event Service et Participation Service s'y inscrivent automatiquement sous les noms `EVENT-SERVICE` et `PARTICIPATION-SERVICE`.

## Configuration (`application.properties`)

| Propriété | Valeur | Signification |
|---|---|---|
| `server.port` | 8761 | Port de l'annuaire |
| `eureka.client.register-with-eureka` | `false` | Le serveur ne s'inscrit pas auprès de lui-même |
| `eureka.client.fetch-registry` | `false` | Il ne copie pas le registre d'un autre serveur (instance unique) |
| `eureka.server.enable-self-preservation` | `false` | Développement : les services arrêtés sont retirés rapidement |

## Lancer

Depuis IntelliJ : ▶ sur `EurekaServerApplication`.

En ligne de commande :

```bash
mvn spring-boot:run
```

Avec toute la pile : `docker compose up -d --build` depuis le dossier parent.
