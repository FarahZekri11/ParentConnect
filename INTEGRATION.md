# Intégration ParentConnect — Event Service & Participation Service

Ce document décrit comment intégrer mes deux microservices dans la plateforme ParentConnect (API Gateway, Keycloak, Eureka et RabbitMQ **partagés, fournis par l'intégrateur**). La logique métier, les routes, les modèles et les bases de données ne changent pas.

## 1. Livrable

| Dossier à copier dans le dépôt du groupe | Contenu |
|---|---|
| `Backend/event-service/` | Microservice Event Service (Java 17, Spring Boot 3.5, PostgreSQL, Flyway) — `Dockerfile`, `.dockerignore`, `docker-compose.service.yml`, `docker-compose.local-test.yml`, `.env.example`, `pom.xml`, `src/`, `README.md` |
| `Backend/participation-service/` | Microservice Participation Service (même stack) — idem |

Fichiers Docker Compose de chaque service :

| Fichier | Usage |
|---|---|
| `docker-compose.service.yml` | **Intégration** : le conteneur du service + sa base PostgreSQL dédiée, rattachés au réseau externe partagé `parentconnect-network`. Ne crée ni Gateway, ni Keycloak, ni Eureka, ni RabbitMQ. Aucun port publié (accès via la Gateway). |
| `docker-compose.local-test.yml` | **Test local isolé** : le service + sa base sur un bridge local, profil `dev` (`GET /dev/tokens`), sans Eureka ni RabbitMQ. Event Service sur http://localhost:8085, Participation Service sur http://localhost:8086 (il joint Event Service via `host.docker.internal:8085`). |
| `.env.example` | Variables de `docker-compose.service.yml` (à copier en `.env` à côté du fichier) |

Le reste du dossier (`docker-compose.yml`, `local-dev/` avec un Eureka local, `scripts/`, `.env.example`) sert **uniquement au développement local** et n'a pas à être intégré.

## 2. Contrat technique (identique pour les deux services)

| Exigence | Mise en œuvre |
|---|---|
| Écoute réseau | `0.0.0.0:8080` (`server.address=0.0.0.0`, port `PORT` → `APP_PORT` → 8080) ; `EXPOSE 8080` dans le Dockerfile |
| Santé publique | `GET /api/health` et `GET /health` → `200 {"status":"UP","service":"parentconnect-..."}` (`503` si la base est indisponible), sans authentification |
| `.dockerignore` | Exclut `target/`, `.env*`, clés, fichiers d'IDE, `.git` |
| JWT Keycloak (mode direct) | RS256 vérifié avec `KEYCLOAK_REALM_PUBLIC_KEY` ; identifiant = `sub` (repli `preferred_username`) ; rôles = `realm_access.roles` (`ADMIN`, `PARENT`, `PROFESSIONAL`) |
| Mode relais Gateway | `X-Gateway-Auth: verified` → identité `X-User-Id` + `X-User-Role` acceptée sans revérifier le JWT |
| Codes HTTP | `401` token absent/invalide/expiré ; `403` rôle insuffisant |
| Eureka | Client Spring Cloud Netflix ; `EUREKA_SERVER_URL` (défaut `http://eureka-server:8761/eureka/`) ; noms `PARENTCONNECT-EVENT-SERVICE` et `PARENTCONNECT-PARTICIPATION-SERVICE` |
| RabbitMQ | Spring AMQP ; hôte `${RABBITMQ_HOST:-rabbitmq}`, port 5672 ; JSON sur l'exchange topic `parentconnect.topic` ; queues `event_events_queue` et `participation_events_queue` |
| Appels interservices | Participation → Event : propagation de `Authorization: Bearer <token>` reçu, en plus de la clé `X-Internal-Api-Key` |

### Identifiant utilisateur

Mes tables stockent l'identifiant utilisateur au format **UUID** (`organizer_id`, `user_id`), ce qui correspond au `sub` généré par Keycloak. L'identifiant est lu comme chaîne (`sub`, sinon `preferred_username`) puis interprété comme UUID. Si `X-User-Id` est propagé par la Gateway, il doit donc contenir le **`sub` Keycloak** (et non le nom d'utilisateur) ; sinon la requête est refusée (`401`).

### Rôles

| Rôle Keycloak (realm) | Droits |
|---|---|
| `PARENT` | Consulter / créer des événements, gérer ses événements, s'inscrire / se désinscrire, consulter ses participations, voir les participants de ses propres événements |
| `PROFESSIONAL` | Consulter / créer des événements, gérer ses événements, voir les participants de ses propres événements (pas d'inscription) |
| `ADMIN` | Tout, y compris modifier / annuler n'importe quel événement et voir tous les participants |

Les rôles doivent être des **rôles de realm** (présents dans `realm_access.roles`). La casse est ignorée et le préfixe `ROLE_` est toléré.

## 3. Variables d'environnement

### Communes aux deux services

| Variable | Obligatoire | Exemple / défaut | Rôle |
|---|---|---|---|
| `KEYCLOAK_REALM_PUBLIC_KEY` | **oui** | `MIIBIjANBgkqhkiG9w0BAQEFAAOC...` | Clé publique RSA du realm `parentconnect` (Keycloak → *Realm settings* → *Keys* → RS256 → *Public key*) |
| `KEYCLOAK_ISSUER` | non | `http://keycloak:8080/realms/parentconnect` | Vérifie le claim `iss` s'il est renseigné (il doit correspondre exactement à l'URL utilisée par les clients pour obtenir le token) |
| `GATEWAY_RELAY_ENABLED` | non | `true` | Mode relais Gateway |
| `EUREKA_SERVER_URL` | non | `http://eureka-server:8761/eureka/` | Serveur Eureka partagé |
| `RABBITMQ_ENABLED` | non | `false` → mettre **`true`** en intégration | Publie les notifications sur RabbitMQ (sinon elles sont seulement journalisées) |
| `RABBITMQ_HOST` / `RABBITMQ_PORT` | non | `rabbitmq` / `5672` | Broker partagé |
| `RABBITMQ_USERNAME` / `RABBITMQ_PASSWORD` | non | `guest` / `guest` | Identifiants RabbitMQ |
| `INTERNAL_API_KEY` | **oui** | `openssl rand -hex 32` | Clé partagée Participation → Event ; **même valeur** pour les deux services |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | **oui** | voir §4 | Base PostgreSQL propre à chaque service |
| `PORT` | non | `8080` | Port interne (déjà fixé par l'image) |
| `SPRING_PROFILES_ACTIVE` | non | vide | Laisser **vide** en intégration (le profil `dev` est réservé aux tests locaux) |

### Spécifique à Participation Service

| Variable | Exemple | Rôle |
|---|---|---|
| `EVENT_SERVICE_URL` | `http://event-service:8080` | URL interne d'Event Service (nom du conteneur sur le réseau Docker) |

## 4. Démarrage avec Docker Compose

### Intégration (réseau partagé)

L'intégrateur crée le réseau et lance ses serveurs partagés (Gateway, Keycloak, Eureka, RabbitMQ) sur `parentconnect-network`, puis :

```bash
docker network create parentconnect-network
```

```bash
cd Backend/event-service && cp .env.example .env && docker compose -f docker-compose.service.yml up -d --build
```

```bash
cd Backend/participation-service && cp .env.example .env && docker compose -f docker-compose.service.yml up -d --build
```

Dans chaque `.env`, renseigner au minimum `KEYCLOAK_REALM_PUBLIC_KEY`, le mot de passe de la base et `INTERNAL_API_KEY` (**même valeur** dans les deux services). Les noms DNS sur le réseau partagé sont `event-service`, `participation-service`, `event-postgres` et `participation-postgres` (port interne 8080 pour les services). Event Service doit être démarré pour que les inscriptions fonctionnent.

Les images contiennent leur propre `HEALTHCHECK` (`GET /api/health`) ; les schémas des bases sont créés automatiquement (migrations Flyway). Si Eureka ou RabbitMQ ne sont pas encore disponibles, les services démarrent quand même et se connectent dès qu'ils le deviennent.

### Test local isolé

```bash
cd Backend/event-service && docker compose -f docker-compose.local-test.yml up -d --build
```

```bash
cd Backend/participation-service && docker compose -f docker-compose.local-test.yml up -d --build
```

Aucun fichier `.env` n'est nécessaire (valeurs de test par défaut). Swagger : http://localhost:8085/swagger-ui/index.html et http://localhost:8086/swagger-ui/index.html ; tokens de test : `GET /dev/tokens`.

## 5. API Gateway

| Route (ordre de priorité) | Destination |
|---|---|
| `POST /api/events/{id}/join`, `DELETE /api/events/{id}/leave`, `GET /api/events/{id}/participants`, `GET /api/events/me/joined` | `lb://PARENTCONNECT-PARTICIPATION-SERVICE` |
| `/api/events`, `/api/events/**` (toutes les autres) | `lb://PARENTCONNECT-EVENT-SERVICE` |
| `/internal/**` | **à bloquer** (appels interservices uniquement) |

Les routes de Participation Service doivent être évaluées **avant** la route générique d'Event Service. Exemple Spring Cloud Gateway : [`docs/api-gateway-routes.yml`](docs/api-gateway-routes.yml).

La Gateway peut soit transmettre le JWT tel quel (mode direct), soit ajouter `X-Gateway-Auth: verified`, `X-User-Id: <sub>`, `X-User-Role: <rôle>` (mode relais). Dans ce second cas, les ports des services ne doivent pas être exposés hors du réseau Docker.

## 6. Événements RabbitMQ publiés

Exchange topic durable **`parentconnect.topic`**, messages JSON :

| Clé de routage | Émetteur | Moment |
|---|---|---|
| `event.event.updated` | Event Service | Modification d'un événement |
| `event.event.cancelled` | Event Service | Annulation d'un événement |
| `participation.participation.joined` | Participation Service | Inscription confirmée |
| `participation.participation.left` | Participation Service | Désinscription |

Exemple de message (`participation.participation.joined`) :

```json
{
  "messageId": "7f0d7c8e-2a4b-4c3e-9d1a-0c1b2a3d4e5f",
  "type": "EventJoined",
  "eventId": "aaaaaaaa-0000-0000-0000-000000000001",
  "eventTitle": "Atelier peinture",
  "actorUserId": "bda329fc-48ea-456c-9109-6dadaf53f42a",
  "recipientUserIds": ["da084d58-c281-4fab-b02e-b5a29529ab95", "bda329fc-48ea-456c-9109-6dadaf53f42a"],
  "occurredAt": "2026-11-11T14:05:00"
}
```

Le Messaging Service peut s'abonner avec une liaison `event.#`, `participation.#` ou `#`. Les queues dédiées `event_events_queue` et `participation_events_queue` sont déclarées (durables) pour les messages destinés à ces services ; elles ne sont liées à aucune clé, car ces services ne consomment aucun événement aujourd'hui.

Les notifications sont publiées après validation de la transaction ; une indisponibilité de RabbitMQ est journalisée et n'empêche jamais l'opération métier ni le démarrage du service.

## 7. Vérifications effectuées

Les deux `docker-compose.service.yml` ont été lancés sur un réseau externe `parentconnect-network` (sans Eureka ni RabbitMQ présents) : services `healthy`, aucun port publié, et depuis un conteneur du réseau (simulant la Gateway) : création d'événement et inscription avec un token RS256, appel Participation → Event par le nom `event-service`, mode relais, `401` sans token, `/dev/tokens` absent. Les deux `docker-compose.local-test.yml` ont été lancés côte à côte : test de bout en bout 22/22.

Vérifié aussi avec un **vrai Keycloak 26** (realm `parentconnect`, rôles de realm `PARENT`, `PROFESSIONAL`, `ADMIN`), un **vrai RabbitMQ 3.13** et le serveur Eureka local, services en mode production (sans profil `dev`) :

- tokens Keycloak RS256 acceptés : création d'événement, inscriptions, participants, désinscription, annulation ;
- `organizerId` / `userId` égaux au `sub` Keycloak ;
- `PROFESSIONAL` refusé à l'inscription (`403`), token modifié (`401`), sans token (`401`) ;
- mode relais Gateway (`X-Gateway-Auth: verified`) : `200` ;
- `/api/health` public : `200` ;
- inscription Eureka : `PARENTCONNECT-EVENT-SERVICE` et `PARENTCONNECT-PARTICIPATION-SERVICE` `UP` sur `<ip>:8080` ;
- messages JSON reçus sur `parentconnect.topic` avec les clés `participation.participation.joined`, `participation.participation.left` et `event.event.cancelled`.

84 tests automatisés (unitaires et d'intégration Testcontainers) couvrent ces comportements, avec des tokens RS256 au format Keycloak.
