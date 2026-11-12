# Participation Service

Microservice ParentConnect de **gestion des inscriptions** aux événements (entité principale `Participation`).

- Port interne : **8080** sur `0.0.0.0` (variable `PORT` / `APP_PORT`) — en local : http://localhost:8086 (Compose local ou IntelliJ en profil `dev`)
- Swagger UI (local) : http://localhost:8086/swagger-ui/index.html — santé publique : `GET /api/health`
- Nom Eureka : `PARENTCONNECT-PARTICIPATION-SERVICE`
- Base : PostgreSQL `participations_db` (migrations Flyway dans `src/main/resources/db/migration`)
- Image Docker : `parentconnect-participation:1.0`
- Dépendance : Event Service (`EVENT_SERVICE_URL`, clé `INTERNAL_API_KEY`)

Documentation complète : [README principal](../../README.md) — intégration (Keycloak, Gateway, Eureka, RabbitMQ, variables) : [INTEGRATION.md](../../INTEGRATION.md).

## Endpoints

Routes publiques sous `/api/events` (compatibilité front / API Gateway) :

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/api/events/{id}/join` | S'inscrire (PARENT, ADMIN) |
| DELETE | `/api/events/{id}/leave` | Se désinscrire |
| GET | `/api/events/{id}/participants` | Participants confirmés (organisateur — vérifié auprès d'Event Service — ou ADMIN) |
| GET | `/api/events/me/joined` | Mes participations (filtre `status`) |
| GET | `/dev/tokens` | JWT de démonstration — **profil `dev` uniquement** |

## Entité `Participation`

`id`, `eventId` (UUID d'Event Service, **sans relation JPA ni clé étrangère**), `userId` (issu du JWT), `joinedAt`, `status` (`CONFIRMED` / `CANCELLED`), `reservationOperationId` (opération qui détient la place côté Event Service), `cancelledAt`, `createdAt`, `updatedAt`, `version`. Contrainte unique `(event_id, user_id)` : une réinscription réactive la même ligne.

## Saga d'inscription

1. Vérification locale (déjà inscrit ?) puis lecture de l'événement auprès d'Event Service.
2. Refus : organisateur, annulé, commencé/terminé, complet.
3. Réservation atomique avec un `operationId` unique (3 tentatives, idempotent).
4. Enregistrement local `CONFIRMED` (transaction courte, hors appel réseau).
5. Échec en 4 → compensation (libération de la place de cette opération). Échec de la compensation → la réconciliation périodique (`ReservationReconciliationService`, toutes les 5 min) libère la place orpheline.

Désinscription : annulation locale puis libération (conditionnée à l'`operationId`, donc sans double libération) ; si Event Service est injoignable, la réconciliation termine la libération.

## Lancer seul (hors Docker Compose)

Event Service et une base `participations_db` doivent être disponibles :

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

Avec le profil `dev`, le service écoute sur 8086 et appelle Event Service sur http://localhost:8085. Variables utiles : `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `KEYCLOAK_REALM_PUBLIC_KEY`, `JWT_SECRET` (identique à Event Service), `INTERNAL_API_KEY` (identique à Event Service), `EVENT_SERVICE_URL`.

## Tests

```bash
mvn verify
```

Tests unitaires (`*Test` : Mockito, WireMock) et d'intégration (`*IT` : Testcontainers PostgreSQL + Event Service simulé par WireMock — Docker requis).

## Image Docker

```bash
docker build -t parentconnect-participation:1.0 .
```

## Intégration ParentConnect

| Élément | Valeur |
|---|---|
| Écoute | `0.0.0.0:8080` (`EXPOSE 8080`) |
| Santé | `GET /api/health` et `GET /health`, publics |
| Authentification | JWT Keycloak RS256 (`KEYCLOAK_REALM_PUBLIC_KEY`, `sub`, `realm_access.roles`) ou relais Gateway (`X-Gateway-Auth: verified`, `X-User-Id`, `X-User-Role`) ; 401 / 403 |
| Eureka | `EUREKA_SERVER_URL` → `PARENTCONNECT-PARTICIPATION-SERVICE` |
| RabbitMQ | `RABBITMQ_ENABLED=true`, `RABBITMQ_HOST` (défaut `rabbitmq`) ; exchange `parentconnect.topic`, queue `participation_events_queue` |

### Fichiers Docker Compose

| Fichier | Commande | Usage |
|---|---|---|
| `docker-compose.local-test.yml` | `docker compose -f docker-compose.local-test.yml up -d --build` | Test local isolé (service + sa base, profil `dev`, port 8086) |
| `docker-compose.service.yml` | `docker compose -f docker-compose.service.yml up -d --build` | Intégration sur le réseau externe `parentconnect-network` (copier `.env.example` en `.env` avant) |

Détails : [INTEGRATION.md](../../INTEGRATION.md).
