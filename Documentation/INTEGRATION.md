# ParentConnect — Intégration des microservices

Architecture finale : **1 API Gateway + 10 microservices métier (6 modules) + 1 Eureka + 1 Keycloak + 1 RabbitMQ**, plus le frontend Angular, orchestrés par **un seul `docker-compose.yml`** sur **un seul réseau Docker** (`parentconnect-network`). Chaque microservice garde sa propre base de données.

> Le module **Géolocalisation** n'est pas intégré (service non disponible pour l'instant). Le service **Identity & Family** n'existe pas : l'authentification est entièrement assurée par Keycloak.

---

## 1. Démarrage (Windows / PowerShell)

Prérequis : **Docker Desktop** démarré (prévoir ~8 Go de RAM pour Docker, ~10 Go de disque pour les images).

```powershell
cd C:\chemin\vers\ParentConnect
```

```powershell
.\scripts\setup.ps1
```

```powershell
docker compose up -d --build
```

Le premier `--build` prend 10 à 20 minutes (téléchargement des dépendances Maven, npm, Composer, pip, Go). Attendre que tout soit sain :

```powershell
docker compose ps
```

Puis lancer les tests d'intégration :

```powershell
.\scripts\smoke-test.ps1
```

| Étape | Rôle |
|---|---|
| `scripts\setup.ps1` (une seule fois) | Crée `.env` depuis `.env.example`, génère la **paire de clés RSA du realm Keycloak** (privée → Keycloak, publique → microservices, `keys/realm-public.pem` → Messaging) et un **secret aléatoire** pour chaque `CHANGE_ME` (mots de passe des bases, RabbitMQ, clés interservices, APP_KEY Laravel). Sur un `.env` existant, ajoute seulement les variables apparues depuis (nouveau service) sans toucher aux valeurs existantes : **à relancer après chaque mise à jour du projet**. |
| `docker compose up -d --build` | Construit les 13 images depuis les Dockerfiles des membres et démarre les 28 conteneurs dans l'ordre (healthchecks). |
| `scripts\smoke-test.ps1` | 81 vérifications en 6 étapes (infrastructure, services, Eureka, sécurité, routes, RabbitMQ). |

Linux / macOS / Git Bash : `./scripts/setup.sh`, puis `docker compose up -d --build`, puis `./scripts/smoke-test.sh`.

| Action | Commande |
|---|---|
| Arrêter (données conservées) | `docker compose down` |
| Redémarrer | `docker compose up -d` |
| Reconstruire après une modification de code | `docker compose up -d --build` |
| Logs d'un service | `docker compose logs -f event-service` |
| Catégories de démonstration (Communauté) | `docker compose exec category-service php artisan db:seed --class=CategorySeeder --force` |

> Ne pas relancer `setup.ps1 -Force` après un premier démarrage : Keycloak garde la clé du premier import, les services recevraient une nouvelle clé publique différente (tous les appels en 401).

## 2. Adresses

| Composant | URL (machine hôte) |
|---|---|
| **Frontend** | http://localhost:4200 |
| **API Gateway** (point d'entrée unique de l'API) | http://localhost:8080 |
| Eureka (tableau de bord) | http://localhost:8761 |
| Keycloak (console : `admin` / `KEYCLOAK_ADMIN_PASSWORD` du `.env`) | http://localhost:8180 |
| RabbitMQ (console : `RABBITMQ_USER` / `RABBITMQ_PASSWORD` du `.env`) | http://localhost:15672 |
| **Swagger centralisé** (Gateway + 10 services, liste déroulante) | http://localhost:8080/swagger-ui.html |
| Config Server (Spring Cloud Config, dossier `Backend/config-repo`) | http://localhost:8888 |

Accès direct aux services (Swagger, démonstration ; le frontend n'utilise **que** la Gateway) :

| Service | URL directe | Swagger |
|---|---|---|
| event-service | http://localhost:8085 | /swagger-ui/index.html |
| participation-service | http://localhost:8086 | /swagger-ui/index.html |
| post / comment / category / report | http://localhost:8001 … 8004 | /api/documentation |
| babysitting-service | http://localhost:8005 | /docs |
| marketplace-service | http://localhost:3002 | /api/docs |
| messaging-service | http://localhost:8007 | /swagger/index.html |
| geo-service | http://localhost:8008 | /docs |

**Comptes de démonstration** (realm `parentconnect`, mot de passe = `KC_DEMO_PASSWORD` du `.env`, sauf les administrateurs : `KC_APP_ADMIN_PASSWORD`, généré par `setup` et appliqué une seule fois par `keycloak-init`) :

| Utilisateur (API / Swagger) | E-mail (connexion au frontend) | Nom | Rôles | `sub` (identifiant stable) |
|---|---|---|---|---|
| `admin` | admin@parentconnect.local | Admin ParentConnect | ADMIN | aaaaaaaa-0000-4000-8000-000000000001 |
| `farah` | farah@parentconnect.local | Farah Zekri | ADMIN | aaaaaaaa-0000-4000-8000-000000000002 |
| `parent_test` | marie.l@email.com | Marie Lambert | PARENT | aaaaaaaa-0000-4000-8000-000000000003 |
| `parent2_test` | paul.d@email.com | Paul Durand | PARENT | aaaaaaaa-0000-4000-8000-000000000004 |
| `pro_test` | sophie.b@email.com | Sophie Bernard | PROFESSIONAL | aaaaaaaa-0000-4000-8000-000000000005 |
| `babysitter_test` | nadia.k@email.com | Nadia Karoui | BABYSITTER | (généré par Keycloak) |

**Rôles** : PARENT, BABYSITTER et ADMIN (PROFESSIONAL conservé pour l'existant). PARENT n'est plus un rôle par défaut du realm : `keycloak-init` a d'abord attribué PARENT explicitement à chaque compte existant (aucun droit perdu), puis l'a retiré des rôles par défaut, pour qu'un babysitter ne soit pas aussi parent.

**Connexion au frontend** (http://localhost:4200) : se connecter avec l'**e-mail** et le mot de passe `KC_DEMO_PASSWORD` (par défaut `ParentConnect2026!`). La page de connexion propose des boutons « Administrateur », « Parent (Marie) » et « Parent (Paul) » qui remplissent les champs. Un mot de passe incorrect est refusé (il n'y a plus de connexion « factice »).

**Créer un compte** : la page « Créer un compte » du frontend appelle `POST /api/auth/register` (API Gateway) avec le rôle choisi, **PARENT** ou **BABYSITTER** (ADMIN refusé : 400). La Gateway crée l'utilisateur dans Keycloak (e-mail = identifiant), puis le frontend le connecte automatiquement. Elle utilise le client confidentiel `parentconnect-registration` (droits limités à la gestion des utilisateurs), créé ou mis à jour à chaque démarrage par le conteneur `keycloak-init` (`Backend/keycloak/init-registration-client.sh`), secret `KC_REGISTRATION_CLIENT_SECRET` du `.env`. Réponses : 201 compte créé, 409 e-mail déjà utilisé, 400 données invalides.

**Famille et profil** : chaque compte a sa propre famille (« Famille <Nom> », sans enfant au départ) et son propre profil, modifiables dans « Ma famille » et « Mon profil ». En l'absence de service Identité & Famille côté backend, ces données sont gardées **dans le navigateur** (par compte).

**Module Événements — qui peut faire quoi :**

| Action | ADMIN | PARENT | PROFESSIONAL |
|---|---|---|---|
| Voir et rechercher les événements | ✅ | ✅ | ✅ |
| Créer, modifier, annuler un événement | ✅ | ❌ (403) | ❌ (403) |
| S'inscrire / se désinscrire (nombre d'enfants, message à l'organisateur) | ❌ (403) | ✅ | ❌ (403) |
| Voir la liste nominative des participants, l'exporter en CSV | ✅ | ❌ (403) | ❌ (403) |

Obtenir un token (exemple PowerShell) :

```powershell
$demoPassword = (Get-Content .env | Select-String '^KC_DEMO_PASSWORD=').ToString().Split('=',2)[1]
$token = (Invoke-RestMethod -Method Post -Uri http://localhost:8180/realms/parentconnect/protocol/openid-connect/token -Body @{ grant_type='password'; client_id='frontend-parentconnect'; username='parent_test'; password=$demoPassword }).access_token
Invoke-RestMethod -Uri http://localhost:8080/api/events -Headers @{ Authorization = "Bearer $token" }
```

## 3. Architecture

```text
 Navigateur ── http://localhost:4200 (Frontend Angular / nginx)
      │  tous les appels API → Gateway
      ▼
 ┌──────────────────── API Gateway :8080 (Spring Cloud Gateway) ─────────────────────┐
 │ JWT Keycloak RS256 vérifié (signature, iss, exp) · en-têtes clients X-User-* retirés│
 │ injecte X-Gateway-Auth / X-User-Id (sub) / X-User-Role / X-User-Roles · CORS       │
 │ transmet Authorization · /internal/** bloqué · /api/admin/** = ADMIN               │
 └───────┬──────────────────────────────────────────────────────────────────────────┘
         │ lb://NOM-EUREKA (résolution via Eureka)
 ┌───────▼───────────────────────────────────────────────────────────────────────────┐
 │ Événements : event-service ◄─(OpenFeign, résolu par Eureka)── participation-service│
 │ Communauté : post · comment · category · report (Laravel)                          │
 │ Babysitting (FastAPI) · Marketplace (NestJS) · Messagerie (Go, REST + WebSocket)   │
 │ Géolocalisation & Quartiers (FastAPI, MongoDB géospatial)                          │
 └───────────────────────────────────────────────────────────────────────────────────┘
   Eureka :8761 ◄── 10 services + Gateway + Config Server   Keycloak :8180 (realm parentconnect)
   Config Server :8888 (Backend/config-repo) ──► event-service, participation-service
   Swagger UI centralisé : Gateway /swagger-ui.html (documents /docs/<service>)
   RabbitMQ :5672 — exchange unique parentconnect.topic ──► Messaging, Géolocalisation…
   Bases dédiées : 7 PostgreSQL · 3 MongoDB · 2 Redis      Réseau : parentconnect-network
```

## 4. Inventaire des microservices

| Module (propriétaire) | Service | Techno | Port interne | Base | Nom Eureka | Santé |
|---|---|---|---|---|---|---|
| Événements (Eya) | event-service | Spring Boot 3.5 / Java 17 | 8080 | PostgreSQL `events_db` | PARENTCONNECT-EVENT-SERVICE | /api/health |
| Événements (Eya) | participation-service | Spring Boot 3.5 / Java 17 | 8080 | PostgreSQL `participations_db` | PARENTCONNECT-PARTICIPATION-SERVICE | /api/health |
| Communauté (Feriel) | post-service | Laravel 12 / PHP 8.2 | 8080 | PostgreSQL `post_db` | PARENTCONNECT-POST | /api/health |
| Communauté (Feriel) | comment-service | Laravel 12 / PHP 8.2 | 8080 | PostgreSQL `comment_db` | PARENTCONNECT-COMMENT | /api/health |
| Communauté (Feriel) | category-service | Laravel 12 / PHP 8.2 | 8080 | PostgreSQL `category_db` | PARENTCONNECT-CATEGORY | /api/health |
| Communauté (Feriel) | report-service | Laravel 12 / PHP 8.2 | 8080 | PostgreSQL `report_db` | PARENTCONNECT-REPORT | /api/health |
| Babysitting | babysitting-service | FastAPI / Python 3.12 | 8080 | PostgreSQL `babysitting_db` + Redis | PARENTCONNECT-BABYSITTING | /health |
| Marketplace (Farah) | marketplace-service | NestJS / Node 20 | 8080 | MongoDB `parentconnect_marketplace` | MARKETPLACE-SERVICE | /api/health |
| Messagerie (Ameni) | messaging-service | Go 1.22 / Gin | 8085 | MongoDB `messaging_db` + Redis | MESSAGING-SERVICE | /health |
| Géolocalisation (Tasnime) | geo-service | FastAPI / Python 3.12 | 8080 | MongoDB `geo_db` (index 2dsphere) | PARENTCONNECT-GEO-SERVICE | /health |
| Infrastructure | config-server | Spring Cloud Config Server (Boot 3.5) | 8888 | dossier `Backend/config-repo` (lecture seule) | PARENTCONNECT-CONFIG-SERVER | /actuator/health |

Les services Laravel, Python, NestJS et Go s'enregistrent dans Eureka par l'API REST d'Eureka (client propre à chaque service). Vérifié : les 10 services restent enregistrés (battements de cœur actifs), y compris après un redémarrage complet de Docker.

## 5. Routes de la Gateway (ordre de priorité)

| # | Chemins | Service | Accès à la Gateway |
|---|---|---|---|
| 0 | `/internal/**`, `/api/internal/**` | — | **bloqué (404)** |
| 1 | `/api/events/*/join`, `/api/events/*/leave`, `/api/events/*/participants`, `/api/events/me/joined` | participation-service | JWT |
| 2 | `/api/events`, `/api/events/**` | event-service | JWT |
| 3 | `/api/posts/*/report`, `/api/comments/*/report`, `/api/admin/reports/**` | report-service | JWT (`/api/admin/**` : ADMIN) |
| 4 | `/api/posts/*/comments`, `/api/comments/**` | comment-service | GET public, écriture JWT |
| 5 | `/api/posts`, `/api/posts/**` | post-service | GET public, écriture JWT |
| 6 | `/api/categories`, `/api/categories/**` | category-service | GET public, écriture JWT |
| 7 | `/api/babysitting/**` | babysitting-service | JWT |
| 8 | `/api/listings`, `/api/listings/**` | marketplace-service | GET public, écriture JWT |
| 9 | `/ws` (WebSocket) | messaging-service | authentifié par le service |
| 10 | `/api/conversations/**`, `/api/messages/**`, `/api/notifications/**` | messaging-service | JWT |
| 11 | `/api/geo`, `/api/geo/**` | geo-service | JWT (création de quartier / lieu sûr : ADMIN, vérifié par le service) |
| 12 | `/eureka/**` | tableau de bord Eureka | public |

Les règles fines (organisateur, auteur, rôle requis) restent appliquées par chaque service. Configuration : `Backend/api-gateway/src/main/resources/application.yml`.

## 6. Sécurité

1. Le frontend obtient un JWT auprès de Keycloak (client public `frontend-parentconnect`).
2. La Gateway vérifie la signature RS256 (clés du realm), l'émetteur `http://localhost:8180/realms/parentconnect` et l'expiration.
3. Elle **supprime** tout en-tête `X-Gateway-Auth` / `X-User-*` envoyé par le client, puis injecte : `X-Gateway-Auth: verified`, `X-User-Id` = `sub`, `X-User-Role` = rôle métier principal (ADMIN > PROFESSIONAL > PARENT), `X-User-Roles` = liste complète, et transmet `Authorization`.
4. Chaque service applique ses propres autorisations (mode relais ou vérification du JWT avec `KEYCLOAK_REALM_PUBLIC_KEY`).

- **Émetteur unique :** `KC_HOSTNAME_URL=http://localhost:8180`, donc l'émetteur `iss` est identique que le token soit obtenu par le navigateur ou par un conteneur.
- **Clé RSA :** générée par `setup` et importée par le realm (placeholder `${KC_REALM_PRIVATE_KEY}`). Elle est stable entre les redémarrages et n'est jamais versionnée.
- **Secrets :** aucun mot de passe, aucune clé ni aucun secret client dans le dépôt. Tout est dans `.env`, généré localement.

## 7. Eureka

- **Instance :** une seule, `discovery-server` (port 8761), avec l'alias réseau **`eureka-server`**, le nom attendu par tous les services.
- **Ajout côté intégration :** `GET /eureka/` répond 200 (filtre `EurekaRootStatusFilterConfig`). Les services Laravel interrogent cette URL avant de s'enregistrer, alors que le serveur Spring répondait 404.
- **Gateway :** cache DNS de 5 s (`HttpClientDnsConfig`), car un service recréé change d'IP et Docker peut redonner l'ancienne IP à un autre conteneur.
- **Redémarrage de Docker / du PC :** tous les conteneurs repartent en même temps, sans ordre de dépendance. Les services réessaient leur enregistrement Eureka et leurs connexions (MongoDB, RabbitMQ) jusqu'à ce que l'infrastructure soit prête. Vérifié : 77/77 après un redémarrage complet du démon Docker, sans aucune action manuelle (compter 1 à 2 minutes).

## 8. RabbitMQ

**Un seul broker**, avec un nom d'hôte fixe (`hostname: rabbitmq`) : RabbitMQ range ses données par nom de nœud, donc les queues durables survivent à la recréation du conteneur. Le conteneur `rabbitmq-init` (relancé automatiquement si RabbitMQ est recréé) déclare au démarrage (script `Backend/rabbitmq/init-definitions.sh`, idempotent) :

| Élément | Type | Usage |
|---|---|---|
| `parentconnect.topic` | exchange topic durable | **exchange unique** : Events, Participation, Babysitting, Marketplace, Messaging, Géolocalisation |
| `parentconnect.events` | exchange topic durable | ancien exchange du contrat Messaging, conservé pour compatibilité |
| `parentconnect.dlx` | exchange direct durable | dead-letter (Messaging → `messaging.dlq`) |
| pont `parentconnect.events` → `parentconnect.topic` (`#`) | liaison exchange → exchange | un service qui publierait encore sur l'ancien exchange reste entendu |

| Service | Publie (clé de routage) | Queue |
|---|---|---|
| event-service | `event.event.updated`, `event.event.cancelled` (enveloppe `EventUpdated` / `EventCancelled`) | `event_events_queue` |
| participation-service | `participation.participation.joined`, `.left` (enveloppe `EventJoined` / `EventLeft`) | `participation_events_queue` |
| babysitting-service | `babysitting.booking.accepted` (enveloppe `BookingAccepted`) | `babysitting_events_queue` (créée au 1er événement) |
| marketplace-service | `marketplace.*`, `listing.*` | `parentconnect.marketplace.queue` |
| geo-service | `geo.neighbor.joined` (enveloppe `NewNeighborJoined`), `geo.address_verified` ; consomme `identity.user_registered` | `geo_events_queue` + DLQ `geo.dlq` |
| messaging-service | `messaging.message.sent` ; consomme `babysitting.booking.accepted`, `participation.participation.joined` / `.left`, `event.event.updated` / `.cancelled`, `marketplace.item.requested`, `geo.neighbor.joined` | `messaging.events` + DLQ `messaging.dlq` |

Format commun (contrat Messaging) : `{"event_id", "type", "version": "1.0", "occurred_at", "data": {…}}`, sans mot de passe ni token. `event_id` sert à l'idempotence. Les messages malformés sont rejetés vers la DLQ (vérifié).

Flux vérifiés de bout en bout :

- **Babysitting → Messagerie** : une demande acceptée ouvre automatiquement la conversation entre les deux parents et notifie le demandeur (`BOOKING_ACCEPTED`) ;
- **Participation → Messagerie** : une inscription notifie l'organisateur et confirme au parent (`EVENT_REGISTRATION`) ;
- **Événements → Messagerie** : une annulation ou une modification notifie chaque parent inscrit (`EVENT_UPDATE`) ;
- **Géolocalisation → Messagerie** : quand un parent enregistre sa position dans un quartier, les parents déjà rattachés à ce quartier sont prévenus (`NEW_NEIGHBOR_JOINED`, sans position ni identité exposée).

## 9. Ports et bases

| Port hôte | Composant | | Port hôte | Composant |
|---|---|---|---|---|
| 4200 | Frontend | | 8001–8004 | post, comment, category, report |
| 8080 | **API Gateway** | | 8005 | babysitting |
| 8761 | Eureka | | 8007 | messaging |
| 8180 | Keycloak | | 3002 | marketplace |
| 5672 / 15672 | RabbitMQ | | 8085 / 8086 | event / participation |
| | | | 8008 | geo (géolocalisation) |

Les bases de données n'exposent **aucun port** sur l'hôte. Elles ne sont joignables que par leur service sur le réseau Docker, et chacune a son volume nommé.

## 10. Résultats des tests

Tests exécutés dans l'environnement d'intégration (pile complète, 28 conteneurs) :

| Étape | Vérifications | Résultat |
|---|---|---|
| 1. Infrastructure | Eureka, Keycloak, RabbitMQ, Gateway, frontend | ✅ 5/5 |
| 2. Services + bases | santé des 10 services (connexion à leur base) | ✅ 10/10 |
| 3. Eureka | 10 services + Gateway enregistrés, battements actifs | ✅ 11/11 |
| 4. Sécurité | sans token, signature falsifiée, en-têtes usurpés, `/internal` (dont `/internal/geo`), accès direct, ADMIN | ✅ 8/8 |
| 5. Routes et métier | événements (création réservée à l'ADMIN, recherche texte), inscriptions (enfants + message, réservées aux parents), participants nominatifs, catégories, posts, commentaires, signalements, babysitting, marketplace, messagerie, géolocalisation (quartiers, création ADMIN, positions floutées), CORS | ✅ 33/33 |
| 6. RabbitMQ | exchanges, pont, queues, notifications d'inscription (Participation → Messaging) et de nouveau voisin (Géolocalisation → Messaging), livraison via l'ancien exchange, DLQ | ✅ 15/15 |

**Total : 92/92** pour le script bash et **91/91** pour le script PowerShell (sans la vérification CORS), sur la pile existante. Une 7ᵉ étape **nettoie les données de test** (post, catégorie, signalement, événement) pour que la démonstration reste propre ; les tests de géolocalisation utilisent les comptes admin et pro_test, sans déplacer Marie et Paul. Une version précédente (77/77) a aussi été validée après un redémarrage complet du démon Docker (tous les conteneurs relancés en même temps, sans intervention), et une plus ancienne (64/64) en démarrage à neuf (nouveau `setup`, volumes vides).

**Tests du frontend dans un navigateur** (Playwright, 45 vérifications, toutes réussies) :

- **Communauté** : un parent publie une question ; un autre voit le nom de l'autrice, commente (son nom apparaît) et signale ; l'admin voit le signalement dans « Modération » et le traite ; l'autrice supprime sa publication.
- **Babysitting** : une garde dans chaque sens (Marie ↔ Paul) : demande publiée (avec parents compatibles), « Je peux garder », confirmation par le demandeur, garde terminée, crédits transférés, historique des crédits, notation.
- **Messagerie** : la garde acceptée crée la conversation ; message envoyé, reçu par l'autre parent, réponse affichée sans recharger la page, noms réels affichés ; la cloche affiche les vraies notifications.
- **Marketplace** : un parent publie une annonce ; un autre la voit, l'ouvre et « Contacter le parent » ouvre une conversation au titre de l'annonce.
- **Événements** (16 vérifications) : mot de passe incorrect refusé ; l'ADMIN crée, modifie, consulte les participants (nom, enfants, message) puis annule un événement ; un parent ne voit pas « Organiser un événement » et ne peut pas ouvrir le formulaire ; il recherche, s'inscrit avec 2 enfants et un message, retrouve l'événement dans « Mes inscriptions » et reçoit la notification d'annulation. Les 9 pages de l'application s'affichent sans erreur JavaScript.

Tests manuels complémentaires :

- un token correctement signé mais **expiré** est refusé (401) par la Gateway et par les services ;
- un payload modifié et `alg=none` sont refusés ;
- un service recréé avec changement d'IP reste correctement routé ;
- une réservation Babysitting réelle (demande → disponibilité → acceptation) crée la conversation dans Messaging ;
- l'annulation d'un événement notifie le parent inscrit (`EVENT_UPDATE`).

## 11. État des composants

| Composant | État |
|---|---|
| API Gateway (routes, JWT, en-têtes, CORS, /internal bloqué) | Implémenté, testé avec succès |
| Eureka (unique, alias `eureka-server`, 10 services) | Implémenté, testé avec succès |
| Keycloak (realm, rôles ADMIN/PARENT/PROFESSIONAL, comptes, clé stable) | Implémenté, testé avec succès |
| RabbitMQ (exchanges, pont, DLQ, livraison Messaging) | Implémenté, testé avec succès |
| Docker Compose central (28 conteneurs, healthchecks, volumes) | Implémenté, testé avec succès (tous les services en mode production, reprise automatique après redémarrage de Docker) |
| Frontend | Intégré. Événements, Communauté, Babysitting, Messagerie, Marketplace et Mon Quartier reliés à leurs services et testés dans un navigateur. « Ma famille » et « Mon profil » restent locaux (aucun service backend Identité/Famille) |
| WebSocket Messagerie (`/ws`) via la Gateway | Route en place, non utilisée par le frontend (rafraîchissement automatique toutes les 4 s à la place : l'envoi REST ne diffuse pas sur le WebSocket) |
| Événements Babysitting / Événements / Participation → Messagerie | Implémenté, testé avec succès |
| Événements Marketplace → Messagerie | Non branché (voir §12) |
| Module Géolocalisation (service + écran « Mon Quartier ») | Implémenté, testé avec succès (API via la Gateway, événement nouveau voisin → Messagerie, écran sans appel en erreur) |
| Service Identity & Family | Inexistant (Babysitting utilise son client d'identité simulé) |

## 12. Corrections apportées aux services (avec l'accord des propriétaires) et points restants

### Corrections appliquées

Avec l'accord des propriétaires, les corrections ont été faites directement dans les services quand elles étaient nécessaires. Quand la configuration centrale suffisait, elles ont été laissées dans `docker-compose.yml`.

| Service | Problème constaté | Correction | Où |
|---|---|---|---|
| Communauté (4 services) | `composer.lock` absent du dépôt alors que le Dockerfile le copie : **le build échouait** | `composer.lock` générés (PHP 8.2) | ajoutés dans chaque service |
| Communauté (4 services) | En `APP_ENV=production`, `view:cache` échouait (dossier `resources/views` non versionné) | Dossier ajouté (`resources/views/.gitkeep`) ; les services tournent en **production** (config, routes et vues en cache) | dans chaque service |
| Communauté (4 services) | Identifiant lu dans `preferred_username` avant `sub` : un même utilisateur avait deux identifiants (nom via accès direct, UUID via la Gateway) | `sub` lu en premier, `preferred_username` en repli | `app/Http/Middleware/JwtAuth.php` |
| Communauté (4 services) | Sans `APP_KEY`, `key:generate` échoue (pas de `.env` dans l'image) | `APP_KEY` générée par `setup` et transmise | `docker-compose.yml` central |
| Communauté (4 services) | `CACHE_STORE` / `SESSION_DRIVER` non transmis : table `cache` absente, erreur 500 à la création de post | Valeurs du `.env.example` du service transmises | `docker-compose.yml` central |
| Babysitting | En `ENVIRONMENT=production`, plantage au démarrage (`UnboundLocalError` : `import sys` local qui masquait l'import du module) | Import local supprimé ; le service tourne en **production** (logs JSON, `/dev/token` désactivé) | `app/core/logging.py` |
| Babysitting | Publiait `{"event_type", "booking_id", …}` : Messaging ignorait l'événement | Publication RabbitMQ au format enveloppe du contrat (`event_id`, `type`, `version`, `occurred_at`, `data`) ; les publieurs Redis et NoOp sont inchangés | `app/events/publisher.py` |
| Messagerie | Exchange `parentconnect.events` au lieu de l'exchange standard | Passage à `parentconnect.topic` (le pont inverse garde l'ancien exchange utilisable) | `internal/events/rabbitmq.go` |
| Messagerie | Rôles lus uniquement dans le claim `role` (absent des tokens Keycloak) | Rôle déduit de `realm_access.roles` (ADMIN > PROFESSIONAL > PARENT) si `role` est absent ; tests unitaires ajoutés | `internal/middleware/auth.go` |
| Messagerie ↔ Événements | Messaging attendait `events.participant.registered`, jamais publié | Liaisons sur les clés réelles (`participation.participation.joined/left`, `event.event.updated/cancelled`) et traitement `EventJoined`, `EventLeft`, `EventUpdated`, `EventCancelled` (nouvelle notification `EVENT_UPDATE`) | `internal/events/rabbitmq.go`, `consumer.go`, `models/notification.go`, `CONTRACT_SPECS.md` |
| Événements / Participation | Messages publiés dans un format propre au module | Publication au format enveloppe du contrat (`EventEnvelope`) ; tests mis à jour | `messaging/EventEnvelope.java`, `RabbitEventNotificationPublisher.java` |
| Marketplace | URI RabbitMQ journalisée avec le mot de passe en clair, et renvoyée en clair dans `brokerUri` de l'endpoint des événements récents | Mot de passe masqué (`amqp://user:****@rabbitmq:5672`) dans le log et dans la réponse | `src/rabbitmq/rabbitmq.service.ts` |
| Géolocalisation | Une phrase collée par erreur en tête de `app/models/location.py` (« push my work in a repo … ») : **erreur de syntaxe, le service ne démarrait pas** et aucun test ne s'exécutait | Ligne rétablie (`from datetime import datetime, timezone`) ; 36/36 tests passent | `app/models/location.py` |
| Géolocalisation ↔ Messagerie | Publiait `geo.neighbor_joined` (`user_id`, `neighborhood_id`, `version: 1` numérique) : Messaging écoute `geo.neighbor.joined` au format du contrat (`NewNeighborJoined`, `new_user_id`, `neighborhood_name`, `neighbor_ids`, version texte) | Événement publié au format du contrat, avec la liste des parents déjà rattachés au quartier (identifiants seulement) ; version `"1.0"` pour tous les événements du service | `app/routers/locations.py`, `app/events/publisher.py`, `tests/test_events.py` |
| Frontend (Farah) | Le nouveau Dockerfile partait d'une image locale `parentconnect-frontend:latest` et copiait un dossier `dist/` non versionné : **impossible à construire sur une autre machine** | Code de Farah intégré (écran « Mon Quartier », service géo, menu) ; le Dockerfile multi-étapes (build Angular dans Docker) est conservé | `Frentend/parentconnect/` |
| Messagerie | Si MongoDB ou RabbitMQ n'étaient pas prêts au démarrage (redémarrage de Docker / du PC), le service restait définitivement en 503 et le consommateur RabbitMQ ne démarrait jamais ; après une première reconnexion RabbitMQ, les coupures suivantes n'étaient plus gérées | Nouvelles tentatives au démarrage (MongoDB, RabbitMQ) et surveillance continue de la connexion RabbitMQ | `cmd/server/main.go`, `internal/events/rabbitmq.go` |
| Babysitting | Enregistrement Eureka abandonné après 3 essais : si Eureka démarrait après le service, celui-ci restait invisible (503 via la Gateway) | L'enregistrement est retenté à chaque battement de cœur tant qu'il n'a pas réussi | `app/main.py`, `app/clients/eureka_client.py` |
| Infrastructure | RabbitMQ recréé = nouveau nom de nœud = queues durables perdues | `hostname: rabbitmq` fixe ; `rabbitmq-init` relancé automatiquement si RabbitMQ est recréé | `docker-compose.yml` central |
| Frontend (toutes les pages) | Angular 22 rend `OnPush` par défaut : les écrans, écrits pour l'ancien mode, ne se rafraîchissaient pas après le chargement des données (squelettes de chargement affichés plus de 60 s, jusqu'à un clic) | `changeDetection: ChangeDetectionStrategy.Eager` sur les 29 composants (comportement pour lequel le code a été écrit) ; liste des événements affichée en ~250 ms | `Frentend/parentconnect/src/app/**/*.component.ts` |
| Frontend (connexion) | Formulaire pré-rempli avec un compte inexistant ; en cas d'échec Keycloak, connexion silencieuse d'un faux utilisateur avec un faux token (toutes les API en 401) | Mauvais identifiants refusés ; repli local seulement si Keycloak est injoignable ; boutons des comptes de démonstration (Admin / Parents) ; rôles Keycloak conservés dans la session | `core/services/auth.service.ts`, `features/auth/login/` |
| Frontend (inscription) | « Créer un compte » ne créait **aucun compte Keycloak** : faux utilisateur avec un faux token, toutes les API en erreur (« Service Événements indisponible ») ; tous les comptes avaient la famille d'exemple « Famille Zekri » (Yasmine, Adam) | Inscription réelle (`POST /api/auth/register` → Keycloak, rôle PARENT) puis connexion automatique ; anciennes sessions fictives effacées ; famille « Famille <Nom> » sans enfant, ajout / retrait d'enfants, renommage ; profil sans données inventées ; 401 → retour à la page de connexion | `core/services/auth.service.ts`, `features/auth/register/`, `features/family/`, `core/interceptors/` |
| API Gateway | Pas d'inscription possible | Endpoint `POST /api/auth/register` (validation, 409 si l'e-mail existe, rôle PARENT) ; conteneur `keycloak-init` (client confidentiel idempotent) ; tests unitaires | `registration/RegistrationController.java`, `Backend/keycloak/init-registration-client.sh` |
| Frontend (Communauté) | Données fictives (6 posts, « j'aime », tags, statistiques inventées) | Relié aux 4 services Laravel : catégories réelles, publication question / partage, recherche, pagination, commentaires, suppression (auteur ou ADMIN), signalement réel, **modération ADMIN** (retirer / rejeter), favoris gardés dans le navigateur ; « j'aime » et statistiques inventées retirés (pas d'API) | `features/community/` |
| Communauté (Feriel) | Auteur des posts et commentaires stocké sans nom ; catégories jamais créées (pas de `DatabaseSeeder`) | Colonne `author_name` (claim `name` du token) dans post-service et comment-service (migrations) ; `DatabaseSeeder` → `CategorySeeder` (idempotent) et `AUTO_SEED=true` | `post-service`, `comment-service`, `category-service` |
| Frontend (Babysitting) | Annuaire fictif de baby-sitters payants (tarifs, avis), sans rapport avec le service réel | Interface refaite selon le service réel (entraide en **crédits-temps**) : demandes à pourvoir, « Je peux garder », demande avec matching, gardes à confirmer / terminer / noter, disponibilités, solde et historique des crédits ; erreurs traduites | `features/babysitting/` |
| Babysitting | Une garde acceptée restait `PENDING` : aucun endpoint pour passer à `ACCEPTED`, donc impossible de la terminer (crédits jamais transférés) | `PATCH /bookings/{id}/confirm` (parent demandeur) ; 3 tests unitaires | `app/services/booking_service.py`, `app/routers/bookings.py` |
| Frontend (Messagerie) | Conversations fictives | Reliée au service Go : conversations, messages, lu/non lu, rafraîchissement automatique, « Contacter » depuis une annonce ou un événement ; cloche de l'en-tête et badge « Messages » avec les vraies données | `features/messaging/`, `layout/` |
| Messagerie | Aucun nom (identifiants seulement) | Nom de l'expéditeur (claim `name` du token) enregistré avec chaque message et dans le dernier message de la conversation | `internal/models`, `internal/services`, `internal/middleware/auth.go` |
| Frontend (Mon Quartier) | Points de rencontre demandés sans quartier (422) puis remplacés par des données fictives | Liste vide tant que le parent n'a pas de quartier | `core/services/geo.service.ts` |
| Frontend (Événements) | Écrans branchés sur des données fictives (4 événements codés en dur) : rien de ce qui était créé n'apparaissait | Service relié aux API via la Gateway (liste, filtres, recherche, détail, création, modification, annulation, inscription, participants) ; boutons selon le rôle ; illustrations intégrées (sans Internet) ; filtre « Mes inscriptions » ; export CSV des participants ; tableau de bord avec les vrais prochains événements | `features/events/`, `features/dashboard/` |
| Événements (Eya) | Création ouverte à tous les rôles ; pas de recherche texte | Création réservée à l'ADMIN ; paramètre `q` (titre, description, lieu, ville ; caractères `%` et `_` neutralisés) ; tests mis à jour et ajoutés | `event-service` : `SecurityConfig`, `EventController`, `EventSpecifications` |
| Participation (Eya) | Inscription anonyme (identifiant seulement), ouverte aussi à l'ADMIN | Inscription réservée aux parents ; détails enregistrés : nom (issu du token, jamais saisi), nombre d'enfants (1 à 10), message (500 caractères) ; migration Flyway `V2` (appliquée sans perte sur une base existante) ; tests ajoutés | `participation-service` |
| API Gateway | Nom complet de l'utilisateur non transmis aux services | En-tête `X-User-Display-Name` (claim `name`, encodé URL), retiré des requêtes clientes comme les autres `X-User-*` | `HeaderSanitizationAndPropagationFilter` |
| Infrastructure | Ajout d'un service = nouvelles variables absentes d'un `.env` déjà généré | `setup` complète un `.env` existant avec les variables manquantes (secrets générés), sans modifier les valeurs existantes ni les clés du realm | `scripts/setup.js` |

Pour leurs tests isolés, les propriétaires peuvent reprendre `APP_KEY`, `CACHE_STORE`, `SESSION_DRIVER` et `QUEUE_CONNECTION` dans leur `docker-compose.service.yml`.

### Points restants (non bloquants pour la démonstration)

| Services | Constat | Suggestion |
|---|---|---|
| Famille / Profil | Données propres à chaque compte mais gardées dans le navigateur : le service Identité & Famille n'existe pas | Créer ce service pour les conserver côté serveur (changement de navigateur / d'ordinateur) |
| Géolocalisation | Pas d'API de suppression : les quartiers « Quartier test … » créés par les tests d'intégration restent listés | Ajouter `DELETE /api/geo/neighborhoods/{id}` (ADMIN) |
| Marketplace ↔ Messagerie | Marketplace publie `marketplace.listing.borrow_request.created` dans son propre format (`eventId`, `eventType`, `payload`, champs en camelCase) ; Messaging attend `marketplace.item.requested` au format enveloppe (`owner_id`, `item_title`…). Aucune notification d'emprunt n'est donc envoyée | Publier l'enveloppe commune (`type: "MarketplaceItemRequested"`) avec la clé `marketplace.item.requested`, ou ajouter cette clé côté Messaging |
| Messagerie | Ameni a poussé une nouvelle version de la branche `messaging` (« finalize messaging microservice and add frontend for api gateway integration »), **non intégrée** ici | À intégrer dans une prochaine étape (comparer avec les corrections ci-dessus avant de fusionner) |
| Géolocalisation | `geo.address_verified` n'est consommé par aucun service ; le guide du service annonce `geo.address.verified` (avec un point) | Harmoniser le nom si un service doit l'écouter |
| Babysitting | 5 tests unitaires échouent (`test_credits` : dépense sous le minimum ; 4 dans `test_matching`). Ils échouaient déjà avant l'intégration, avec le code d'origine | À corriger par la propriétaire du service |

## 13. Fichiers de l'intégration

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | Composition centrale (remplace l'ancienne version, qui ne contenait que la Marketplace) |
| `.env.example` | Variables partagées, sans secret |
| `scripts/setup.js`, `setup.ps1`, `setup.sh` | Génération du `.env` et des clés |
| `scripts/recover-env.ps1` | Reconstruction du `.env` et de `keys/` à partir des conteneurs existants (si le `.env` a été supprimé après un premier démarrage) |
| `scripts/smoke-test.ps1`, `smoke-test.sh` | Tests d'intégration par étapes |
| `Backend/api-gateway/` | Routes, sécurité, rôle principal, cache DNS court |
| `Backend/discovery-server/` | Réponse 200 sur `/eureka/` |
| `Backend/keycloak/parentconnect-realm.json` | Rôles PARENT/PROFESSIONAL, comptes de test, clé et mots de passe via variables |
| `Backend/rabbitmq/init-definitions.sh` | Exchanges, pont, DLX |
| `Backend/event-service/`, `Backend/participation-service/` | Module Événements (ajouté) |
| `Backend/geo-service/` | Module Géolocalisation (ajouté depuis la branche `geo-service`, dossier racine `geo-service/` d'origine) |

Les fichiers `docker-compose.service.yml` et `docker-compose.local-test.yml` des membres sont conservés tels quels pour leurs tests isolés. L'ancien `Backend/docker-compose.yml` et les modules de démonstration `feign-client`, `rabbitmq-service` et `keycloak-security-service` ne sont pas utilisés par la composition centrale.

## 14. Erreurs fréquentes

| Symptôme | Solution |
|---|---|
| `Lancer d'abord scripts/setup` au `docker compose up` | Exécuter `.\scripts\setup.ps1` |
| `setup.ps1` : « l'exécution de scripts est désactivée » | `powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1` |
| Un port est déjà utilisé (8080, 5672…) | Changer le port correspondant dans `.env` (section « Ports ») |
| Tous les appels en 401 après `setup -Force` | Clé du realm différente : supprimer le volume Keycloak (`docker volume rm parentconnect_keycloak_storage`) puis `docker compose up -d` |
| 503 sur une route juste après le démarrage | Le service n'est pas encore enregistré dans Eureka : attendre 30 secondes |
| `docker compose ps` affiche `unhealthy` | `docker compose logs <service>` |
| Build très long ou en échec réseau | Relancer `docker compose up -d --build` (les étapes réussies sont en cache) |
