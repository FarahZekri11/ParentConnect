# ParentConnect – Babysitting Microservice (`babysitting-service`)

Microservice de garde d'enfants de l'écosystème distribué **ParentConnect**.
Fournit les fonctionnalités de demandes de garde, de disponibilités des baby-sitters, d'orchestration atomique des réservations, de gestion des crédits-temps, de notation et d'algorithme de matching.

---

## 1. Stack Technique

- **Langage** : Python 3.12+
- **Framework** : FastAPI / Uvicorn (ASGI asynchrone)
- **ORM** : SQLAlchemy 2.0 (AsyncIO) + asyncpg
- **Migrations** : Alembic
- **Base de Données** : PostgreSQL 16 (dédiée au service : `babysitting_db`)
- **Cache & Verrous Distribués** : Redis 7 (`babysitting:lock:*`, `babysitting:ratelimit:*`)
- **Découverte de Service** : Client HTTP Eureka asynchrone (`PARENTCONNECT-BABYSITTING`)
- **Messagerie Asynchrone** : RabbitMQ (Topic Exchange `parentconnect.topic`, queue `babysitting_events_queue`)
- **Authentification & Sécurité** : Keycloak Realm `parentconnect` (RS256) + Mode Relais Gateway (`X-Gateway-Auth: verified`)

---

## 2. Intégration dans l'Architecture ParentConnect

### A. Port Interne & Écoute Réseau
- **Écoute** : `0.0.0.0`
- **Port standardisé** : `8080` (configurable via `PORT` / `APP_PORT` / `SERVICE_PORT`)
- **Healthcheck sans authentification (200 OK)** :
  - `GET /health`
  - `GET /api/health`
  - `GET /api/babysitting/health`

### B. Routage & Contrat API Gateway
Toutes les requêtes externes transitent par l'API Gateway centralisé (`http://localhost:8080`) qui route vers ce microservice sous le préfixe `/api/babysitting/*` :

| Méthode | Route | Rôle Requis | Description |
|---|---|---|---|
| `GET` | `/api/babysitting/requests` | Public / Authentifié | Liste des annonces de garde |
| `POST` | `/api/babysitting/requests` | `PARENT`, `ADMIN` | Créer une demande de garde |
| `GET` | `/api/babysitting/requests/{id}` | Authentifié | Consulter le détail d'une demande |
| `POST` | `/api/babysitting/requests/{id}/accept` | `PROFESSIONAL`, `BABYSITTER` | Accepter une demande (réservation) |
| `GET` | `/api/babysitting/availability` | Public / Authentifié | Créneaux disponibles |
| `POST` | `/api/babysitting/availability` | `PROFESSIONAL`, `BABYSITTER` | Déclarer une disponibilité |
| `GET` | `/api/babysitting/bookings` | Authentifié | Mes réservations |
| `PATCH` | `/api/babysitting/bookings/{id}/status` | Authentifié | Confirmer / annuler / terminer |
| `GET` | `/api/babysitting/credits/balance` | Authentifié | Solde de crédits-temps |
| `GET` | `/api/babysitting/credits/transactions`| Authentifié | Historique des transactions |
| `POST` | `/api/babysitting/ratings` | Authentifié | Noter une prestation de garde |
| `GET` | `/api/babysitting/ratings/user/{id}` | Public | Avis et réputation d'un utilisateur |
| `GET` | `/api/babysitting/matching/{request_id}`| Authentifié | Matching intelligent des baby-sitters |

### C. Authentification & Sécurité

Le microservice supporte deux modes complémentaires :

1. **Mode Relais Gateway (Défense en profondeur & Performance)** :
   Si l'API Gateway a déjà validé le JWT en amont, elle injecte l'en-tête `X-Gateway-Auth: verified`.
   Le microservice fait confiance à l'identité propagée via `X-User-Id` et `X-User-Role` sans recalculer la signature asymétrique RSA.
2. **Mode Direct (JWT Bearer RS256)** :
   Vérification directe de la signature asymétrique RS256 via la clé publique RSA du Realm `parentconnect` fournie par `KEYCLOAK_REALM_PUBLIC_KEY`.
   - Extrait `sub` ou `preferred_username` comme identifiant utilisateur.
   - Extrait les rôles depuis `realm_access.roles` (`ADMIN`, `PARENT`, `PROFESSIONAL`).
3. **Codes HTTP d'erreur** :
   - `401 Unauthorized` si token absent, invalide ou expiré.
   - `403 Forbidden` si rôle insuffisant.

### D. Enregistrement Eureka (Service Discovery)
- **URL** : `${EUREKA_SERVER_URL:-http://eureka-server:8761/eureka/}`
- **Nom du service** : `PARENTCONNECT-BABYSITTING`
- **Instance Host** : `babysitting-service`
- Enregistrement automatique au démarrage avec heartbeats toutes les 30s et désinscription propre à l'arrêt (`SIGTERM`).

### E. Messagerie RabbitMQ
- **Host / Port** : `${RABBITMQ_HOST:-rabbitmq}:5672`
- **Exchange Partagé** : `parentconnect.topic` (Topic Exchange, durable)
- **Queue Dédiée** : `babysitting_events_queue`
- **Routing Keys** : `babysitting.<entite>.<action>` (ex: `babysitting.booking.accepted`)

### F. Transfert de Token Inter-Services
Lors des appels HTTP vers d'autres services (ex: `identity-service`), l'en-tête `Authorization: Bearer <token>` reçu est systématiquement propagé.

---

## 3. Déploiement & Fichiers Docker Compose

### Intégration Équipe (`docker-compose.service.yml`)
Lance le conteneur du microservice rattaché au réseau externe partagé `parentconnect-network` :

```bash
docker compose -f docker-compose.service.yml up --build -d
```

### Test Local Standalone (`docker-compose.local-test.yml`)
Permet de tester le service isolément sur votre machine avec sa propre base PostgreSQL et Redis sur un bridge local sans infrastructure externe requise :

```bash
docker compose -f docker-compose.local-test.yml up --build
```
L'API est accessible sur `http://localhost:8080`.
Documentation Swagger interactive : `http://localhost:8080/docs`.
