# ParentConnect — Event Service & Participation Service

Backend des fonctionnalités **Événements** et **Participations** de ParentConnect, plateforme d'entraide locale entre parents.

Ce dossier contient **deux microservices Spring Boot indépendants** (`Backend/event-service`, `Backend/participation-service`), chacun avec sa propre base PostgreSQL, son image Docker et sa documentation Swagger. Ils sont **prêts pour l'intégration** avec l'API Gateway, Keycloak, Eureka et RabbitMQ partagés du projet : voir **[INTEGRATION.md](INTEGRATION.md)**.

Pour développer et tester en local, un environnement complet (les deux services, leurs bases et un Eureka local) se lance avec une seule commande :

```bash
docker compose up -d --build
```

| Microservice | Entité principale | Port interne (conteneur) | Port local (hôte) | Nom Eureka | Base PostgreSQL | Swagger UI (local) |
|---|---|---|---|---|---|---|
| **Event Service** | `Event` | 8080 | 8085 | `PARENTCONNECT-EVENT-SERVICE` | `events_db` (hôte : 5433) | http://localhost:8085/swagger-ui/index.html |
| **Participation Service** | `Participation` | 8080 | 8086 | `PARENTCONNECT-PARTICIPATION-SERVICE` | `participations_db` (hôte : 5434) | http://localhost:8086/swagger-ui/index.html |
| Eureka Server (**local uniquement**) | — | 8761 | 8761 | — | — | Tableau de bord : http://localhost:8761 |

Santé publique : `GET /api/health` (ou `/health`) sur chaque service.

Chaque service possède aussi ses propres fichiers `docker-compose.service.yml` (intégration sur le réseau partagé `parentconnect-network`) et `docker-compose.local-test.yml` (test isolé avec sa seule base) : voir [INTEGRATION.md](INTEGRATION.md).

---

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Démarrage rapide avec Docker Desktop](#2-démarrage-rapide-avec-docker-desktop)
3. [Architecture générale](#3-architecture-générale)
4. [Fonctionnement des microservices](#4-fonctionnement-des-microservices)
5. [Bases de données et migrations](#5-bases-de-données-et-migrations)
6. [Communication REST et cohérence des inscriptions](#6-communication-rest-et-cohérence-des-inscriptions)
7. [Sécurité JWT](#7-sécurité-jwt)
8. [Variables d'environnement](#8-variables-denvironnement)
9. [Images Docker et Docker Compose](#9-images-docker-et-docker-compose)
10. [Swagger UI](#10-swagger-ui)
11. [Exemples de requêtes curl](#11-exemples-de-requêtes-curl)
12. [JWT de test (profil dev)](#12-jwt-de-test-profil-dev)
13. [Tests](#13-tests)
14. [Erreurs fréquentes](#14-erreurs-fréquentes)
15. [API Gateway](#15-api-gateway)
16. [Notifications (Messaging Service)](#16-notifications-messaging-service)
17. [Eureka (annuaire des services)](#17-eureka-annuaire-des-services)
18. [Intégration ParentConnect](#18-intégration-parentconnect)

---

## 1. Prérequis

| Outil | Version | Utilité |
|---|---|---|
| Docker Desktop | 4.x (Docker Engine 24+ avec Compose v2) | Lancer toute la pile — **seul prérequis obligatoire** |
| Java (JDK) | 17 ou plus | Facultatif : lancer/tester depuis l'IDE |
| Maven | 3.9+ | Facultatif : compiler et lancer les tests hors Docker |

Aucune installation de PostgreSQL, Java ou Maven n'est nécessaire pour utiliser Docker : la compilation se fait **dans** l'image (Dockerfile multi-stage).

## 2. Démarrage rapide avec Docker Desktop

1. Démarrer **Docker Desktop** et attendre que l'indicateur affiche *Engine running*.
2. Ouvrir un terminal dans le dossier `parentconnect-backend` (PowerShell, Terminal macOS, Git Bash...).
3. Créer le fichier de configuration (une seule fois) puis, idéalement, remplacer les valeurs `change-me` :

   ```bash
   cp .env.example .env
   ```

   Sous PowerShell : `Copy-Item .env.example .env`

4. Construire les images et démarrer les 5 conteneurs :

   ```bash
   docker compose up -d --build
   ```

   Le premier lancement télécharge les dépendances Maven (quelques minutes). Les suivants utilisent le cache Docker.

5. Vérifier que tout est sain (`healthy`) :

   ```bash
   docker compose ps
   ```

6. Ouvrir Swagger UI : http://localhost:8085/swagger-ui/index.html et http://localhost:8086/swagger-ui/index.html
7. Ouvrir le tableau de bord Eureka : http://localhost:8761 — `PARENTCONNECT-EVENT-SERVICE` et `PARENTCONNECT-PARTICIPATION-SERVICE` doivent être `UP` (environ 30 s après leur démarrage).

### Commandes utiles

| Action | Commande |
|---|---|
| Démarrer / reconstruire après une modification | `docker compose up -d --build` |
| Afficher les conteneurs | `docker compose ps` |
| Suivre les logs de tous les services | `docker compose logs -f` |
| Logs d'un seul service | `docker compose logs -f participation-service` |
| Arrêter (les données sont **conservées**) | `docker compose down` |
| Arrêter **et effacer** les bases (remise à zéro) | `docker compose down -v` |
| Redémarrer un service | `docker compose restart event-service` |

> `docker compose down` supprime les conteneurs et le réseau mais **pas** les volumes nommés `parentconnect-event-postgres-data` et `parentconnect-participation-postgres-data` : les données sont retrouvées au prochain démarrage. Seul `docker compose down -v` les efface.

### Visualiser la pile dans Docker Desktop

- **Containers** : un groupe `parentconnect` contient les 5 conteneurs (`parentconnect-eureka`, `parentconnect-event-service`, `parentconnect-participation-service`, `parentconnect-event-postgres`, `parentconnect-participation-postgres`). La colonne *Status* indique `healthy` lorsque les healthchecks réussissent. Les boutons ▶ / ■ / ↻ démarrent, arrêtent et redémarrent chaque conteneur.
- **Logs** : cliquer sur un conteneur → onglet *Logs* (équivalent de `docker compose logs -f <service>`). Cliquer sur le groupe `parentconnect` affiche les logs combinés.
- **Images** : `parentconnect-eureka:1.0`, `parentconnect-event:1.0` et `parentconnect-participation:1.0` apparaissent dans l'onglet *Images*.
- **Volumes** : l'onglet *Volumes* liste les deux volumes PostgreSQL persistants (et leur taille).
- **Réseau** : les conteneurs partagent le réseau `parentconnect-network` (visible avec `docker network inspect parentconnect-network`).
- **Ports** : les liens `8085:8080` et `8086:8080` de la colonne *Port(s)* ouvrent directement les services dans le navigateur (port local 8085/8086, port interne 8080).

## 3. Architecture générale

```text
          Front → API Gateway (JWT Keycloak RS256, realm parentconnect)
                                │
         ┌──────────────────────┴───────────────────────┐
         │ /api/events, /api/events/{id},               │ /api/events/{id}/join|leave|participants
         │ /api/events/me/organized                     │ /api/events/me/joined
         ▼                                              ▼
┌──────────────────────────┐   REST interne     ┌────────────────────────────┐
│      Event Service       │◄───────────────────│   Participation Service    │
│  port interne 8080       │  /internal/**      │  port interne 8080         │
│  entité : Event          │  X-Internal-Api-Key│  entité : Participation    │
│  + registre des places   │  (lecture, réserve,│  + réconciliation          │
│                          │   libère, liste)   │                            │
└────────────┬─────────────┘                    └──────────────┬─────────────┘
             │ JPA / Flyway                                     │ JPA / Flyway
     ┌───────▼────────┐                                ┌────────▼────────────┐
     │   events_db    │                                │  participations_db  │
     │ event-postgres │                                │ participation-postgres│
     └────────────────┘                                └─────────────────────┘
           Réseau Docker commun : parentconnect-network (appels par nom : http://event-service:8080)
```

Principes respectés :

- **Une entité métier principale par microservice** : `Event` dans Event Service, `Participation` dans Participation Service. Aucune entité `User` (l'utilisateur est identifié par l'UUID du JWT).
- **Bases strictement séparées** : aucun service n'accède à la base de l'autre ; `Participation.eventId` est un simple UUID (pas de `@ManyToOne`, pas de clé étrangère SQL inter-bases).
- **Communication uniquement par REST** (RestClient Spring), avec délais, nouvelles tentatives et traduction des erreurs.
- **Aucune transaction distribuée** : la cohérence est assurée au niveau applicatif (voir §6).

Arborescence :

```text
parentconnect-backend/
├── Backend/                       # ← LIVRABLE : à copier dans ParentConnect/Backend/
│   ├── event-service/             # Microservice 1 (Spring Boot indépendant)
│   │   ├── src/main/java/com/parentconnect/events/
│   │   │   ├── controller/            # EventController, InternalEventController, HealthController, DevTokenController
│   │   │   ├── service/               # EventService, SeatReservationService, EventCompletionScheduler
│   │   │   ├── repository/            # EventRepository, SeatReservationRepository, EventSpecifications (Haversine)
│   │   │   ├── entity/                # Event, EventCategory, EventStatus, SeatReservation (registre technique)
│   │   │   ├── dto/ (+ dto/internal)  # DTO publics et interservices
│   │   │   ├── mapper/                # EventMapper (manuel)
│   │   │   ├── exception/             # Exceptions + GlobalExceptionHandler
│   │   │   ├── config/                # OpenAPI, Clock
│   │   │   ├── security/              # JWT Keycloak RS256, relais Gateway, rôles, clé interne, JWT de démo (dev)
│   │   │   ├── messaging/             # EventNotificationPublisher (logs / RabbitMQ)
│   │   │   └── client/                # (vide : Event Service n'appelle aucun service)
│   │   ├── src/main/resources/        # application*.yml, db/migration (Flyway), db/seed (profil dev)
│   │   ├── src/test/                  # Tests unitaires + intégration Testcontainers
│   │   ├── docker-compose.service.yml, docker-compose.local-test.yml, .env.example
│   │   ├── pom.xml, Dockerfile, .dockerignore, README.md
│   └── participation-service/     # Microservice 2 (Spring Boot indépendant)
│       ├── src/main/java/com/parentconnect/participations/
│       │   ├── controller/            # ParticipationController, HealthController, DevTokenController
│       │   ├── service/               # ParticipationService (saga), ParticipationStore, ReservationReconciliationService
│       │   ├── repository/            # ParticipationRepository
│       │   ├── entity/                # Participation, ParticipationStatus
│       │   ├── dto/, mapper/, exception/, config/, security/, messaging/
│       │   └── client/                # EventServiceClient (RestClient + retries + propagation du token)
│       ├── docker-compose.service.yml, docker-compose.local-test.yml, .env.example
│       ├── src/main/resources/, src/test/, pom.xml, Dockerfile, .dockerignore, README.md
├── local-dev/                     # Développement local UNIQUEMENT (infrastructure partagée fournie par l'intégrateur)
│   └── eureka-server/             # Eureka local (Spring Cloud Netflix, port 8761)
├── docs/api-gateway-routes.yml    # Routes à déclarer dans l'API Gateway
├── docs/FRONTEND-EVENTS.md        # Consignes Frontend pour les événements et participations
├── scripts/e2e-test.sh            # Test de bout en bout sur la pile Docker locale
├── docker-compose.yml             # Environnement local (Eureka + 2 services + 2 bases + RabbitMQ facultatif)
├── .env.example                   # Modèle de configuration locale
├── INTEGRATION.md                 # Contrat d'intégration (port, santé, Keycloak, Gateway, Eureka, RabbitMQ)
└── README.md
```

## 4. Fonctionnement des microservices

### Event Service (port interne 8080, local 8085)

| Méthode | Endpoint | Description | Accès |
|---|---|---|---|
| POST | `/api/events` | Créer un événement | PARENT, PROFESSIONNEL, ADMIN |
| GET | `/api/events` | Lister / rechercher (filtres, pagination, tri) | Authentifié |
| GET | `/api/events/{id}` | Détails | Authentifié |
| PUT | `/api/events/{id}` | Modifier | Organisateur ou ADMIN |
| DELETE | `/api/events/{id}` | Annuler (statut `CANCELLED`, idempotent) | Organisateur ou ADMIN |
| GET | `/api/events/me/organized` | Mes événements créés | Authentifié |
| GET | `/internal/events/{id}` | Instantané pour Participation Service | Clé interne |
| POST | `/internal/events/{id}/reservations` | Réserver une place (atomique, idempotent) | Clé interne |
| POST | `/internal/events/{id}/reservations/release` | Libérer une place (idempotent) | Clé interne |
| GET | `/internal/reservations/active` | Places actives (réconciliation) | Clé interne |

**Recherche** (`GET /api/events`) — filtres combinables : `city`, `category`, `dateFrom`, `dateTo` (`yyyy-MM-dd`), `childAge`, `lat`, `lng`, `radiusKm` (défaut 10 km, formule de **Haversine** calculée par PostgreSQL), `onlyAvailable`, `status` (défaut `PUBLISHED`) ; pagination `page`, `size` (max 100) ; tri `sort=startDateTime,asc` (champs autorisés : `startDateTime`, `endDateTime`, `createdAt`, `title`, `city`, `capacity`, `category`).

**Règles métier** : titre, ville, catégorie, dates et capacité obligatoires ; capacité > 0 ; début dans le futur ; fin après le début ; âge min ≤ âge max ; latitude/longitude ensemble ; seul l'organisateur ou un ADMIN modifie/annule ; un événement annulé, terminé ou commencé n'est plus modifiable ; la capacité ne peut pas descendre sous le nombre de places réservées ; un événement terminé passe automatiquement en `COMPLETED` (tâche planifiée toutes les 10 min).

### Participation Service (port interne 8080, local 8086)

| Méthode | Endpoint | Description | Accès |
|---|---|---|---|
| POST | `/api/events/{id}/join` | S'inscrire | PARENT, ADMIN |
| DELETE | `/api/events/{id}/leave` | Se désinscrire | PARENT, ADMIN |
| GET | `/api/events/{id}/participants` | Participants confirmés | Organisateur (vérifié via Event Service) ou ADMIN |
| GET | `/api/events/me/joined` | Mes participations (filtre `status`) | PARENT, ADMIN |

**Règles métier** : pas de double inscription (contrainte unique `(event_id, user_id)`) ; une inscription annulée est **réactivée** (même ligne) si des places sont disponibles ; l'organisateur ne peut pas s'inscrire à son événement ; refus si l'événement est complet, annulé, commencé ou terminé ; la désinscription libère la place ; impossible de se désinscrire d'un événement commencé.

## 5. Bases de données et migrations

Chaque service possède son conteneur PostgreSQL 16, son volume persistant et ses migrations **Flyway** (`ddl-auto=validate` : Hibernate ne modifie jamais le schéma).

| Service | Migrations | Contenu |
|---|---|---|
| Event Service | `V1__create_events_table.sql` | Table `events`, contraintes CHECK (dates, capacité > 0, `0 <= reserved_places <= capacity`, âges, coordonnées), index (ville, catégorie, dates, statut, organisateur, coordonnées) |
| | `V2__create_seat_reservations_table.sql` | Registre technique des places : unique `(event_id, user_id)`, `operation_id`, statut `ACTIVE`/`RELEASED` |
| | `db/seed/V1000__demo_events.sql` | 5 événements de démonstration — **profil `dev` uniquement** |
| Participation Service | `V1__create_participations_table.sql` | Table `participations`, unique `(event_id, user_id)`, CHECK statut, index utilisateur/événement. **Aucune clé étrangère vers events_db** |

Connexion depuis l'hôte (DBeaver, pgAdmin, IntelliJ) : `localhost:5433/events_db` et `localhost:5434/participations_db` avec les identifiants du `.env`.

## 6. Communication REST et cohérence des inscriptions

### Déroulement d'une inscription (`POST /api/events/{id}/join`)

1. Participation Service lit le `userId` **dans le JWT** (jamais dans le corps de la requête).
2. Il vérifie localement que l'utilisateur n'est pas déjà inscrit (`CONFIRMED`).
3. Il récupère l'événement auprès d'Event Service (`GET /internal/events/{id}`) : statut, dates, organisateur, places restantes.
4. Il refuse l'organisateur, un événement annulé, commencé/terminé ou complet.
5. Il génère un **`operationId` unique** et demande la réservation (`POST /internal/events/{id}/reservations`).
6. Event Service réserve la place **atomiquement** (voir ci-dessous) et indique quelle opération détient la place.
7. Participation Service enregistre la participation `CONFIRMED` (transaction locale courte) avec cet `operationId`.
8. Il publie la notification `EventJoined` et renvoie `201 Created`.

### Mécanismes de fiabilité

| Problème | Solution implémentée |
|---|---|
| Surréservation lors d'inscriptions simultanées | `SELECT ... FOR UPDATE` sur la ligne de l'événement (verrou pessimiste) : vérification de capacité et incrément dans la **même transaction**. Contrainte SQL `CHECK (reserved_places <= capacity)` en dernier rempart. Testé avec 25 réservations parallèles pour 5 places. |
| Requêtes rejouées (retry, double clic) | Registre `seat_reservations` : une ligne par `(event_id, user_id)` mémorisant l'`operation_id` détenteur. Rejouer la même opération ne consomme jamais de seconde place ; une nouvelle opération pour une place déjà détenue la réutilise (`alreadyHeld=true`). |
| Double inscription simultanée côté Participation | Contrainte unique `(event_id, user_id)` + `@Version`. Le perdant constate que l'inscription gagnante utilise la même opération : il renvoie le résultat sans libérer la place. |
| Délais réseau / pannes transitoires | RestClient avec délai de connexion (2 s) et de lecture (5 s), **3 tentatives** avec attente exponentielle sur erreur réseau, 5xx et 429 — sans risque grâce à l'idempotence. Au-delà : `503 Service Unavailable`. |
| Échec après réservation (base locale indisponible...) | **Compensation** : libération de la place réservée par *cette* opération. Si la place appartenait à une opération antérieure, elle n'est pas touchée. |
| Réservation sans réponse (issue inconnue) | Compensation immédiate : si la réservation n'est pas encore arrivée, Event Service pose une **pierre tombale** (`RELEASED` pour cet `operationId`) ; une réservation retardée par le réseau qui arriverait ensuite est refusée. |
| Double libération | La libération est conditionnée à l'`operationId` détenteur **et** à l'état `ACTIVE`. Une deuxième libération renvoie `ALREADY_RELEASED` sans décrémenter. |
| Désinscription quand Event Service est injoignable | La participation est d'abord annulée localement (la désinscription réussit), la libération est retentée par la réconciliation. |
| Panne pendant la compensation | **Réconciliation périodique** (toutes les 5 min, `ReservationReconciliationService`) : Participation Service parcourt les places `ACTIVE` d'Event Service inchangées depuis 120 s. Sans participation `CONFIRMED` correspondante → libération **conditionnelle** (même `operationId` et toujours inactive depuis 120 s, vérifié sous verrou par Event Service), ce qui évite toute course avec une inscription en cours. |
| Appels réseau dans une transaction | Interdit par conception : `ParticipationStore` ouvre des transactions courtes (`REQUIRES_NEW`) ; aucun appel HTTP n'est effectué pendant qu'une transaction est ouverte. |

### Contrat des endpoints internes

- Authentification : en-tête `X-Internal-Api-Key: <INTERNAL_API_KEY>` (comparaison en temps constant). Un JWT utilisateur, même ADMIN, ne suffit pas (`401` sans la clé).
- Participation Service **propage** l'en-tête `Authorization: Bearer <token>` reçu de l'utilisateur sur ces appels (sécurité de bout en bout) ; Event Service l'accepte sans en dépendre, la clé interne restant le seul critère d'accès (la tâche de réconciliation, qui n'a pas d'utilisateur, utilise uniquement la clé).
- Ces chemins ne doivent jamais être exposés par l'API Gateway (voir §15).

## 7. Sécurité JWT (Keycloak)

Les deux services **valident** les JWT émis par **Keycloak** (realm `parentconnect`) ; ils n'en émettent jamais en production. La validation est locale (aucun appel à Keycloak par requête).

### Mode direct (JWT Bearer)

| Élément | Valeur attendue |
|---|---|
| Algorithme | **RS256** (tout autre algorithme est refusé ; HS256 n'est accepté qu'en profil `dev`) |
| Clé | Clé publique RSA du realm : `KEYCLOAK_REALM_PUBLIC_KEY` (Keycloak → *Realm settings* → *Keys* → RS256 → *Public key*, valeur Base64 ; le format PEM est aussi accepté) |
| `exp` | **Obligatoire**, tolérance d'horloge de 30 s |
| `nbf` | Vérifié s'il est présent |
| `iss` | Vérifié seulement si `KEYCLOAK_ISSUER` est renseigné (ex. `http://keycloak:8080/realms/parentconnect`) |
| Identifiant utilisateur | `sub` (repli : `preferred_username`), lu comme chaîne puis interprété comme **UUID** : c'est le format des identifiants Keycloak et celui des colonnes `organizer_id` / `user_id` de mes bases (inchangées) |
| Rôles | `realm_access.roles` : `PARENT`, `PROFESSIONAL` (= `PROFESSIONNEL`), `ADMIN`. Casse ignorée, préfixe `ROLE_` toléré, rôles techniques Keycloak (`offline_access`, `uma_authorization`, `default-roles-...`) ignorés |

Exemple de payload Keycloak accepté :

```json
{
  "iss": "http://keycloak:8080/realms/parentconnect",
  "sub": "bda329fc-48ea-456c-9109-6dadaf53f42a",
  "preferred_username": "parent1",
  "realm_access": { "roles": ["default-roles-parentconnect", "offline_access", "PARENT", "uma_authorization"] },
  "iat": 1793282400,
  "exp": 1793282700
}
```

### Mode relais API Gateway

Si la requête contient `X-Gateway-Auth: verified`, l'identité propagée par la Gateway est utilisée **sans revérifier la signature** du JWT :

| En-tête | Contenu |
|---|---|
| `X-User-Id` | Identifiant utilisateur (`sub` Keycloak, UUID) |
| `X-User-Role` | Rôle(s) : `PARENT`, `PROFESSIONAL`, `ADMIN` (plusieurs séparés par des virgules acceptés) |

Ce mode suppose que le port des services n'est joignable **que par la Gateway** (réseau Docker interne). Il peut être désactivé avec `GATEWAY_RELAY_ENABLED=false`.

### Codes HTTP

| Situation | Code |
|---|---|
| Token absent, mal formé, expiré, mal signé, `sub` non UUID ; `X-Gateway-Auth: verified` sans `X-User-Id` valide | **401** |
| Authentifié mais rôle insuffisant (ex. `PROFESSIONAL` sur `/join`, rôle inconnu) ou ni organisateur ni ADMIN | **403** |

Les erreurs 401/403 utilisent le même format JSON que les autres erreurs.

## 8. Variables d'environnement

| Variable | Service(s) | Description | Défaut |
|---|---|---|---|
| `PORT` / `APP_PORT` | les deux | Port d'écoute (sur `0.0.0.0`) | `8080` (imposé par l'image Docker) ; 8085 / 8086 depuis l'IDE en profil `dev` |
| `SPRING_PROFILES_ACTIVE` | les deux | `dev` (seed + `/dev/tokens` + tokens de démo HS256), vide (production) | `dev` dans `.env.example` local |
| `KEYCLOAK_REALM_PUBLIC_KEY` | les deux | Clé publique RSA du realm `parentconnect` | **obligatoire hors profil dev** |
| `KEYCLOAK_ISSUER` | les deux | Émetteur attendu (vide = non vérifié) | vide |
| `JWT_USER_ID_CLAIM` / `JWT_ROLES_CLAIM_PATH` | les deux | Claim de l'identifiant / chemin des rôles | `sub` / `realm_access.roles` |
| `GATEWAY_RELAY_ENABLED` | les deux | Confiance dans `X-Gateway-Auth: verified` | `true` |
| `JWT_SECRET` | les deux | Secret des tokens de démonstration HS256 (**profil dev uniquement**) | — |
| `INTERNAL_API_KEY` | les deux | Clé des appels Participation → Event (`/internal/**`), identique des deux côtés | **obligatoire** |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | chacun | Connexion à sa propre base PostgreSQL | `localhost:5432`, `events_db` / `participations_db` |
| `EVENT_SERVICE_URL` | Participation | URL interne d'Event Service | `http://event-service:8080` |
| `EUREKA_SERVER_URL` | les deux | Serveur Eureka partagé | `http://eureka-server:8761/eureka/` |
| `EUREKA_ENABLED` | les deux | `false` pour ne pas s'inscrire auprès d'Eureka | `true` |
| `RABBITMQ_ENABLED` | les deux | `true` : publication sur RabbitMQ ; sinon notifications journalisées | `false` |
| `RABBITMQ_HOST` / `RABBITMQ_PORT` | les deux | Broker RabbitMQ | `rabbitmq` / `5672` |
| `RABBITMQ_USERNAME` / `RABBITMQ_PASSWORD` | les deux | Identifiants RabbitMQ | `guest` / `guest` |
| `RECONCILIATION_INTERVAL` / `RECONCILIATION_GRACE_SECONDS` | Participation | Fréquence / délai de grâce de la réconciliation | `PT5M` / `120` |
| `*_HOST_PORT` | Compose local | Ports exposés sur l'hôte | 8085, 8086, 8761, 5433, 5434 |
| `TZ` | tous | Fuseau horaire des conteneurs | `Europe/Paris` |

Variables avancées (fichiers `application.yml`) : `SERVER_ADDRESS` (défaut `0.0.0.0`), `EVENT_SERVICE_CONNECT_TIMEOUT`, `EVENT_SERVICE_READ_TIMEOUT`, `EVENT_SERVICE_MAX_ATTEMPTS`, `RABBITMQ_EXCHANGE`...

## 9. Images Docker et Docker Compose

Chaque service possède un **Dockerfile multi-stage** :

1. étape `build` (`maven:3.9-eclipse-temurin-17`) : téléchargement des dépendances (couche mise en cache) puis `mvn package` ;
2. étape `runtime` (`eclipse-temurin:17-jre-alpine`) : uniquement le JAR, exécuté par un utilisateur non-root, `PORT=8080`, `EXPOSE 8080`, `HEALTHCHECK` sur `GET /api/health`.

Aucun secret n'est intégré à l'image : tout est injecté par `docker-compose.yml` depuis `.env`.

Construire une image seule :

```bash
docker build -t parentconnect-event:1.0 ./Backend/event-service
```

```bash
docker build -t parentconnect-participation:1.0 ./Backend/participation-service
```

`docker-compose.yml` (environnement **local**) définit :

- `event-postgres` et `participation-postgres` : PostgreSQL 16, volumes nommés persistants, healthcheck `pg_isready`, ports hôte 5433 / 5434 ;
- `event-service` : démarre quand `event-postgres` est *healthy* ;
- `participation-service` : démarre quand `participation-postgres` **et** `event-service` sont *healthy* ; appelle Event Service via `http://event-service:8080` ;
- ports : 8085 → 8080 (Event) et 8086 → 8080 (Participation), donc les mêmes URLs locales qu'avant ;
- réseau `parentconnect-network`, politique `restart: unless-stopped` ;
- `eureka-server` (construit depuis `local-dev/eureka-server`) : Eureka **local** (port 8761) ; les deux microservices attendent qu'il soit *healthy* avant de démarrer ;
- `rabbitmq` : RabbitMQ **local et facultatif**, uniquement avec `--profile rabbitmq` (et `RABBITMQ_ENABLED=true`).

## 10. Swagger UI

- Event Service : http://localhost:8085/swagger-ui/index.html — groupes *API publique*, *API interne*, *Outils de développement*
- Participation Service : http://localhost:8086/swagger-ui/index.html

Les pages Swagger sont publiques, les endpoints métier restent protégés. Pour tester :

1. Profil `dev` : exécuter `GET /dev/tokens` (groupe *Outils de développement*, sélecteur en haut à droite) et copier `accessToken`.
2. Cliquer sur **Authorize**, coller le token (sans le préfixe `Bearer`), valider.
3. Les requêtes suivantes incluent automatiquement l'en-tête `Authorization`.

Les deux services utilisent le même `JWT_SECRET` : un token généré par l'un est accepté par l'autre.

## 11. Exemples de requêtes curl

Les exemples utilisent bash (Linux, macOS, Git Bash). Générer des tokens de démonstration (profil `dev`) :

```bash
ORGANIZER=$(curl -s "http://localhost:8085/dev/tokens?role=PARENT&userId=11111111-1111-1111-1111-111111111111" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
PARENT=$(curl -s "http://localhost:8085/dev/tokens?role=PARENT&userId=22222222-2222-2222-2222-222222222222" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
```

Créer un événement :

```bash
curl -i -X POST http://localhost:8085/api/events \
  -H "Authorization: Bearer $ORGANIZER" -H "Content-Type: application/json" \
  -d '{"title":"Atelier peinture","description":"Pour les 4-8 ans","category":"ATELIER",
       "startDateTime":"2026-12-05T14:00:00","endDateTime":"2026-12-05T16:00:00",
       "locationName":"Maison des associations","address":"12 rue Garibaldi","city":"Lyon",
       "latitude":45.76,"longitude":4.85,"capacity":10,"minChildAge":4,"maxChildAge":8}'
```

Réponse `201 Created` :

```json
{
  "id": "5d1c0e0a-4c1f-4f25-9a51-3f8f1f0b6a11",
  "title": "Atelier peinture",
  "category": "ATELIER",
  "startDateTime": "2026-12-05T14:00:00",
  "endDateTime": "2026-12-05T16:00:00",
  "city": "Lyon",
  "capacity": 10,
  "reservedPlaces": 0,
  "availablePlaces": 10,
  "full": false,
  "organizerId": "11111111-1111-1111-1111-111111111111",
  "status": "PUBLISHED"
}
```

Rechercher les ateliers à moins de 5 km de Lyon centre, pour un enfant de 5 ans, avec des places :

```bash
curl -s "http://localhost:8085/api/events?category=ATELIER&lat=45.764&lng=4.8357&radiusKm=5&childAge=5&onlyAvailable=true&sort=startDateTime,asc" \
  -H "Authorization: Bearer $PARENT"
```

S'inscrire, consulter ses participations, se désinscrire (remplacer `EVENT_ID`) :

```bash
curl -i -X POST http://localhost:8086/api/events/EVENT_ID/join -H "Authorization: Bearer $PARENT"
```

```bash
curl -s http://localhost:8086/api/events/me/joined -H "Authorization: Bearer $PARENT"
```

```bash
curl -i -X DELETE http://localhost:8086/api/events/EVENT_ID/leave -H "Authorization: Bearer $PARENT"
```

Liste des participants (organisateur ou ADMIN) :

```bash
curl -s http://localhost:8086/api/events/EVENT_ID/participants -H "Authorization: Bearer $ORGANIZER"
```

Annuler l'événement :

```bash
curl -i -X DELETE http://localhost:8085/api/events/EVENT_ID -H "Authorization: Bearer $ORGANIZER"
```

Exemple d'erreur (`409 Conflict`) :

```json
{
  "timestamp": "2026-10-29T15:00:00",
  "status": 409,
  "error": "Conflict",
  "message": "L'événement est complet",
  "path": "/api/events/5d1c0e0a-4c1f-4f25-9a51-3f8f1f0b6a11/join"
}
```

| Code | Signification |
|---|---|
| 400 | Données invalides (validation, dates, filtres, tri) |
| 401 | Token absent, expiré, mal signé ou sans rôle reconnu |
| 403 | Authentifié mais non autorisé (pas organisateur/ADMIN, rôle insuffisant) |
| 404 | Événement ou inscription introuvable |
| 409 | Conflit métier (complet, annulé, déjà inscrit, capacité < places réservées...) |
| 503 | Event Service indisponible après plusieurs tentatives |

## 12. JWT de test (profil dev)

Pour tester sans Keycloak, le profil **`dev`** active `GET /dev/tokens` sur les deux services :

```bash
curl -s "http://localhost:8085/dev/tokens?role=PARENT&userId=22222222-2222-2222-2222-222222222222&validityMinutes=120"
```

Les tokens générés ont **le même contenu qu'un token Keycloak** (`sub`, `preferred_username`, `realm_access.roles`) mais sont signés en HS256 avec `JWT_SECRET`.

Utilisateurs de démonstration : organisateur des événements de démo `11111111-1111-1111-1111-111111111111` (PARENT), parents `22222222-...` et `33333333-...`, administrateur `99999999-9999-9999-9999-999999999999`. Rôles acceptés : `PARENT`, `PROFESSIONAL` (ou `PROFESSIONNEL`), `ADMIN`.

Garanties :

- les tokens de démonstration passent par la validation standard (signature, expiration, rôles) : la sécurité n'est jamais désactivée ;
- **hors profil `dev`**, l'endpoint, le seed et les tokens HS256 **n'existent pas** : seuls les tokens Keycloak RS256 sont acceptés ;
- en profil `dev`, si `KEYCLOAK_REALM_PUBLIC_KEY` est renseignée, les vrais tokens Keycloak sont **aussi** acceptés.

## 13. Tests

Les tests d'intégration utilisent **Testcontainers** : Docker doit être démarré.

```bash
cd Backend/event-service && mvn verify
```

```bash
cd Backend/participation-service && mvn verify
```

Les tokens des tests sont de **vrais JWT RS256 au format Keycloak**, signés par une paire de clés RSA générée pour les tests (sa clé publique est injectée dans `KEYCLOAK_REALM_PUBLIC_KEY`).

`mvn test` lance uniquement les tests unitaires (sans Docker).

| Service | Classe | Type | Ce qui est vérifié |
|---|---|---|---|
| Event | `EventServiceTest` (12) | Unitaire (Mockito) | Création, dates invalides, âges, modification par l'organisateur / un ADMIN, refus non autorisé, capacité < réservées, annulation, idempotence, notifications |
| Event | `EventControllerIT` (11) | Intégration (MockMvc + vrais JWT + PostgreSQL) | 401 sans token / token expiré / signature falsifiée, Swagger public, 201/400/403/404/409, recherche avec chaque filtre (ville, catégorie, âge, Haversine, disponibilité, dates, tri) |
| Event | `SeatReservationIT` (12) | Intégration PostgreSQL | Réservation atomique, **25 réservations concurrentes pour 5 places**, doubles requêtes concurrentes du même utilisateur, idempotence, pas de double libération, pierre tombale, refus complet/annulé/passé/organisateur, passage en COMPLETED |
| Event | `InternalEventControllerIT` (4) | Intégration | Clé interne obligatoire, JWT seul refusé sur `/internal`, token propagé accepté avec la clé, réserve/libère/liste en HTTP |
| Event | `IntegrationReadinessIT` (6) | Intégration | `/api/health` et `/health` publics, rôles Keycloak (`PROFESSIONAL`, minuscules), `sub` non UUID → 401, sans rôle → 403, relais Gateway (identité propagée, incomplète → 401, rôle insuffisant → 403, `/internal` non ouvert) |
| Event | `RabbitEventNotificationPublisherTest` (1) | Unitaire | Publication sur `parentconnect.topic` avec la clé `event.event.cancelled` |
| Participation | `ParticipationServiceTest` (19) | Unitaire (Mockito) | Inscription, double inscription, complet, annulé, passé, propre événement, 404, désinscription, réinscription, permissions, panne d'Event Service, compensation, échec de compensation, place détenue par une opération antérieure, doublon concurrent |
| Participation | `EventServiceClientTest` (6) | WireMock | En-tête interne, retries (503 puis connexion coupée puis succès, même `operationId`), délai dépassé → 503, 409/404 traduits, 401 non retenté |
| Participation | `ParticipationControllerIT` (7) | Intégration (MockMvc + JWT + PostgreSQL + WireMock) | Parcours complet inscription/désinscription/réinscription, conflits, 404, 503 + compensation, autorisations participants, contrainte unique en base |
| Participation | `ReservationReconciliationIT` (1) | Intégration | Libération des places orphelines, conservation des places confirmées |
| Participation | `IntegrationReadinessIT` (4) | Intégration | Santé publique, **propagation de `Authorization`** vers Event Service, relais Gateway, `PROFESSIONAL` → 403, token falsifié → 401 |
| Participation | `RabbitEventNotificationPublisherTest` (1) | Unitaire | Publication sur `parentconnect.topic` avec la clé `participation.participation.joined` |

`EventControllerIT` vérifie aussi qu'un token HS256 est refusé hors profil `dev`. Total : **84 tests** (46 Event Service, 38 Participation Service).

**Test de bout en bout entre les deux services** (pile Docker démarrée avec le profil `dev`) :

```bash
./scripts/e2e-test.sh
```

Il crée un événement, lance des inscriptions **simultanées** (12 utilisateurs pour 4 places par défaut ; `CONCURRENT_USERS=20 CAPACITY=5 ./scripts/e2e-test.sh`), vérifie la cohérence entre les deux bases puis teste double inscription, permissions, désinscription, réinscription et annulation.

## 14. Erreurs fréquentes

| Symptôme | Cause / solution |
|---|---|
| `EVENT_DB_PASSWORD doit être défini dans .env` au lancement | Le fichier `.env` est absent : `cp .env.example .env` |
| `Aucune clé de validation JWT` au démarrage | Hors profil `dev`, `KEYCLOAK_REALM_PUBLIC_KEY` est obligatoire |
| `KEYCLOAK_REALM_PUBLIC_KEY invalide` | Copier la valeur *Public key* (Base64) de la clé **RS256** du realm, pas le certificat ni le `kid` |
| `Bind for 0.0.0.0:5433 failed: port is already allocated` | Port occupé (autre PostgreSQL, autre projet) : changer `EVENT_DB_HOST_PORT` / `PARTICIPATION_DB_HOST_PORT` / `*_SERVICE_HOST_PORT` dans `.env` |
| Un service reste `starting`/`unhealthy` | `docker compose logs -f event-service`. Le premier démarrage peut prendre ~1 min. |
| `JWT_SECRET trop court` dans les logs | HS256 exige au moins 32 octets ; générer avec `openssl rand -base64 48` |
| `401` avec un token Keycloak | Clé publique d'un autre realm, token expiré (durée Keycloak courte, 5 min par défaut), `KEYCLOAK_ISSUER` différent du claim `iss` (l'URL utilisée pour obtenir le token compte : `localhost` ≠ `keycloak`) |
| `403` avec un token Keycloak valide | Rôle absent de `realm_access.roles` (les rôles doivent être des rôles **de realm**, pas de client) |
| `401` sur `/internal/**` | `INTERNAL_API_KEY` différente entre les services |
| `503` sur `/join` | Event Service arrêté ou injoignable : `docker compose ps`, vérifier `EVENT_SERVICE_URL=http://event-service:8080` (jamais `localhost` entre conteneurs) |
| `404` sur `/dev/tokens` | Le profil `dev` n'est pas actif : `SPRING_PROFILES_ACTIVE=dev` dans `.env`, puis `docker compose up -d` |
| Flyway : `password authentication failed` après changement de mot de passe | Le volume conserve l'ancien mot de passe : remettre l'ancien ou réinitialiser avec `docker compose down -v` (efface les données) |
| Tests `*IT` : `Could not find a valid Docker environment` | Démarrer Docker Desktop avant `mvn verify` |
| Données de démo absentes | Elles ne sont insérées qu'avec le profil `dev` |
| Un service n'apparaît pas dans Eureka | Attendre ~30 s ; vérifier `EUREKA_SERVER_URL` (`http://eureka-server:8761/eureka/` dans Docker, `http://localhost:8761/eureka/` depuis l'IDE en profil `dev`) |
| Logs `Cannot execute request on any known server` depuis l'IDE | Eureka n'est pas démarré : lancer `local-dev/eureka-server`, ou définir `EUREKA_ENABLED=false`. Le service fonctionne quand même. |
| Deux services sur le port 8080 depuis l'IDE | Lancer avec le profil `dev` (8085 / 8086) ou définir `PORT` dans la configuration d'exécution |

## 15. API Gateway

Les routes de Participation Service utilisent le préfixe `/api/events` pour rester compatibles avec le front. La Gateway doit déclarer **explicitement** ces routes, avec une priorité supérieure à la route générique d'Event Service, et bloquer `/internal/**`. Exemple complet (Spring Cloud Gateway) : [`docs/api-gateway-routes.yml`](docs/api-gateway-routes.yml).

| Chemin | Service cible (Eureka) |
|---|---|
| `POST /api/events/{id}/join`, `DELETE /api/events/{id}/leave`, `GET /api/events/{id}/participants`, `GET /api/events/me/joined` | `lb://PARENTCONNECT-PARTICIPATION-SERVICE` |
| Tout autre `/api/events` et `/api/events/**` | `lb://PARENTCONNECT-EVENT-SERVICE` |
| `/internal/**` | **Bloqué** |

Les deux services acceptent soit le JWT Keycloak transmis tel quel (mode direct), soit l'identité propagée par la Gateway (`X-Gateway-Auth: verified`, `X-User-Id`, `X-User-Role`).

## 16. Notifications (Messaging Service)

| Notification | Émise par | Clé de routage RabbitMQ | Destinataires |
|---|---|---|---|
| `EventJoined` | Participation Service | `participation.participation.joined` | organisateur + participant |
| `EventLeft` | Participation Service | `participation.participation.left` | organisateur + participant |
| `EventUpdated` | Event Service | `event.event.updated` | participants ayant une place active |
| `EventCancelled` | Event Service | `event.event.cancelled` | participants ayant une place active |

Message JSON (`EventNotificationMessage`) : `messageId`, `type`, `eventId`, `eventTitle`, `actorUserId`, `recipientUserIds`, `occurredAt`. Les notifications sont publiées **après le commit** de la transaction métier ; une panne de messagerie n'annule jamais l'opération.

- Par défaut (`RABBITMQ_ENABLED=false`) : `LoggingEventNotificationPublisher` (lignes `[NOTIFICATION]` dans les logs).
- `RABBITMQ_ENABLED=true` (ou profil `rabbitmq`) : `RabbitEventNotificationPublisher` publie en JSON sur l'exchange topic partagé **`parentconnect.topic`** (hôte `RABBITMQ_HOST`, défaut `rabbitmq`, port 5672). Chaque service déclare sa queue dédiée (`event_events_queue`, `participation_events_queue`), sans liaison puisqu'il ne consomme aucun événement aujourd'hui.
- En local : `RABBITMQ_ENABLED=true` dans `.env`, puis `docker compose --profile rabbitmq up -d --build` (interface : http://localhost:15672, `guest` / `guest`). RabbitMQ n'est jamais requis pour démarrer un service.

## 17. Eureka (annuaire des services)

**Eureka** (Spring Cloud Netflix) est l'annuaire des microservices : au démarrage, chaque service s'y inscrit avec son adresse, puis envoie un signal de vie toutes les 10 s. Un service arrêté est retiré de la liste après 30 s environ. L'API Gateway trouve ainsi un service par son nom (`lb://PARENTCONNECT-EVENT-SERVICE`) au lieu d'une adresse fixe.

| Élément | Valeur |
|---|---|
| Client | `spring-cloud-starter-netflix-eureka-client` (Spring Cloud **2025.0.2**, compatible Spring Boot 3.5) |
| Serveur | `EUREKA_SERVER_URL`, défaut `http://eureka-server:8761/eureka/` |
| Noms d'enregistrement | `PARENTCONNECT-EVENT-SERVICE`, `PARENTCONNECT-PARTICIPATION-SERVICE` |
| Adresse inscrite | IP du conteneur et port interne **8080** (`prefer-ip-address=true`) |

Le serveur Eureka est une **infrastructure partagée fournie par l'intégrateur**. Celui de `local-dev/eureka-server` ne sert qu'aux tests locaux (`docker compose up`, ou ▶ sur `EurekaServerApplication` dans IntelliJ) et ne fait pas partie du livrable.

- Eureka **n'est pas indispensable au fonctionnement métier** : si l'annuaire est arrêté, les deux services restent disponibles et se réinscrivent automatiquement à son retour.
- La communication Participation Service → Event Service utilise `EVENT_SERVICE_URL` (`http://event-service:8080` dans Docker).
- Pendant les tests automatisés, l'inscription est désactivée (`eureka.client.enabled=false`).

## 18. Intégration ParentConnect

Le contrat d'intégration complet (dossiers à copier, variables d'environnement, extrait Docker Compose pour l'intégrateur, Gateway, Keycloak, Eureka, RabbitMQ) est décrit dans **[INTEGRATION.md](INTEGRATION.md)**.

