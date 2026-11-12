# Event Service

Microservice ParentConnect de **gestion des événements** (entité principale `Event`).

- Port interne : **8080** sur `0.0.0.0` (variable `PORT` / `APP_PORT`) — en local : http://localhost:8085 (Compose local ou IntelliJ en profil `dev`)
- Swagger UI (local) : http://localhost:8085/swagger-ui/index.html — santé publique : `GET /api/health`
- Nom Eureka : `PARENTCONNECT-EVENT-SERVICE`
- Base : PostgreSQL `events_db` (migrations Flyway dans `src/main/resources/db/migration`)
- Image Docker : `parentconnect-event:1.0`

Documentation complète : [README principal](../../README.md) — intégration (Keycloak, Gateway, Eureka, RabbitMQ, variables) : [INTEGRATION.md](../../INTEGRATION.md).

## Responsabilités

- Créer, modifier, annuler, consulter et rechercher des événements (`/api/events`).
- Détenir la **vérité sur les places** : réservation et libération atomiques et idempotentes pour Participation Service (`/internal/**`, clé `X-Internal-Api-Key`).
- Passer automatiquement les événements terminés au statut `COMPLETED`.
- Publier les notifications `EventUpdated` et `EventCancelled`.

## Endpoints

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/api/events` | Créer (organisateur = utilisateur du JWT) |
| GET | `/api/events` | Lister / rechercher : `city`, `category`, `dateFrom`, `dateTo`, `childAge`, `lat`, `lng`, `radiusKm`, `onlyAvailable`, `status`, `page`, `size`, `sort` |
| GET | `/api/events/{id}` | Détails |
| PUT | `/api/events/{id}` | Modifier (organisateur ou ADMIN) |
| DELETE | `/api/events/{id}` | Annuler (organisateur ou ADMIN) |
| GET | `/api/events/me/organized` | Mes événements |
| GET | `/internal/events/{id}` | Instantané interne |
| POST | `/internal/events/{id}/reservations` | Réserver une place `{userId, operationId}` |
| POST | `/internal/events/{id}/reservations/release` | Libérer `{userId, operationId, requireIdleSeconds?}` |
| GET | `/internal/reservations/active` | Places actives inchangées depuis `idleForSeconds` (pagination par `afterId`) |
| GET | `/dev/tokens` | JWT de démonstration — **profil `dev` uniquement** |

## Réservation atomique

`SeatReservationService` verrouille la ligne de l'événement (`SELECT ... FOR UPDATE`), contrôle l'état (publié, non commencé, non complet, demandeur ≠ organisateur), incrémente `reserved_places` et enregistre la place dans `seat_reservations` (une ligne par couple événement/utilisateur avec l'`operation_id` détenteur). Rejouer une opération ne consomme jamais de seconde place ; une libération n'agit que sur l'opération détentrice encore active ; libérer une opération inconnue pose une « pierre tombale » qui bloque une réservation retardée.

`seat_reservations` est un registre **technique** interne (idempotence, réconciliation) et non une entité métier exposée : l'unique entité métier du service reste `Event`.

## Lancer seul (hors Docker Compose)

PostgreSQL local requis (`events_db`), puis :

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

Avec le profil `dev`, le service écoute sur 8085 et accepte les tokens de démonstration (`GET /dev/tokens`). Variables utiles : `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `KEYCLOAK_REALM_PUBLIC_KEY`, `JWT_SECRET`, `INTERNAL_API_KEY` (le profil `dev` fournit des valeurs de repli réservées au développement).

Pour démarrer seulement la base avec Docker :

```bash
docker compose -f ../../docker-compose.yml up -d event-postgres
```

puis utiliser `DB_PORT=5433`.

## Tests

```bash
mvn verify
```

Tests unitaires (`*Test`, Mockito) et d'intégration (`*IT`, Testcontainers PostgreSQL — Docker requis).

## Image Docker

```bash
docker build -t parentconnect-event:1.0 .
```

## Intégration ParentConnect

| Élément | Valeur |
|---|---|
| Écoute | `0.0.0.0:8080` (`EXPOSE 8080`) |
| Santé | `GET /api/health` et `GET /health`, publics |
| Authentification | JWT Keycloak RS256 (`KEYCLOAK_REALM_PUBLIC_KEY`, `sub`, `realm_access.roles`) ou relais Gateway (`X-Gateway-Auth: verified`, `X-User-Id`, `X-User-Role`) ; 401 / 403 |
| Eureka | `EUREKA_SERVER_URL` → `PARENTCONNECT-EVENT-SERVICE` |
| RabbitMQ | `RABBITMQ_ENABLED=true`, `RABBITMQ_HOST` (défaut `rabbitmq`) ; exchange `parentconnect.topic`, queue `event_events_queue` |

### Fichiers Docker Compose

| Fichier | Commande | Usage |
|---|---|---|
| `docker-compose.local-test.yml` | `docker compose -f docker-compose.local-test.yml up -d --build` | Test local isolé (service + sa base, profil `dev`, port 8085) |
| `docker-compose.service.yml` | `docker compose -f docker-compose.service.yml up -d --build` | Intégration sur le réseau externe `parentconnect-network` (copier `.env.example` en `.env` avant) |

Détails : [INTEGRATION.md](../../INTEGRATION.md).
