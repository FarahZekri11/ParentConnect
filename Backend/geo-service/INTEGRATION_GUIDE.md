# 📦 ParentConnect — Fiche d'Intégration & Guide Technique : Geo-Service

Ce document constitue le contrat d'intégration officiel du microservice **Geo & Neighborhood Service (`geo-service`)** à destination du responsable de l'intégration et des équipes Backend / Frontend.

---

## 1. 📋 Fiche d'Identité du Microservice

| Propriété | Valeur Standardisée |
| :--- | :--- |
| **Nom du service** | `geo-service` |
| **Nom d'enregistrement Eureka** | `PARENTCONNECT-GEO-SERVICE` |
| **Nom de l'image Docker** | `parentconnect/geo-service:latest` |
| **Stack Technique** | Python 3.12 / FastAPI / Motor (Async MongoDB 7) / Uvicorn / aio-pika |
| **Base de Données Dédiée** | MongoDB 7 (`geo_db`) avec index géospatiaux `2dsphere` |
| **Port Interne d'Écoute** | `8080` (0.0.0.0:8080) |
| **Endpoints de Santé (Health)** | `GET /health` et `GET /api/health` (HTTP 200 sans auth) |
| **Exchange RabbitMQ** | `parentconnect.topic` (type: topic, durable: true) |
| **Queue RabbitMQ Dédiée** | `geo_events_queue` |
| **Réseau Docker Partagé** | `parentconnect-network` (external: true) |

---

## 2. 🐳 Fichiers Docker Livrés & Commandes

### A. Fichiers Disponibles dans le Dossier `geo-service/`
1. `Dockerfile` : Image multi-stage optimisée Python 3.12, utilisateur non-root `appuser`, `EXPOSE 8080`.
2. `.dockerignore` : Exclusion de `.venv`, `__pycache__`, `.idea`, tests et fichiers temporaires.
3. `docker-compose.service.yml` : Conteneur de production locale rattaché au réseau `parentconnect-network`.
4. `docker-compose.local-test.yml` : Test autonome local (Service + MongoDB dédié sur bridge isolé).

### B. Commandes pour l'Intégrateur

#### 1. Construire l'image Docker :
```bash
cd geo-service
docker build -t parentconnect/geo-service:latest .
```

#### 2. Démarrer avec la Stack Partagée (Réseau `parentconnect-network`) :
Assurez-vous que le réseau externe existe (`docker network create parentconnect-network` si nécessaire) :
```bash
docker compose -f docker-compose.service.yml up -d
```

#### 3. Tester le service en isolation complète sur sa machine :
```bash
docker compose -f docker-compose.local-test.yml up --build
```
Vérifier la santé immédiate :
```bash
curl http://localhost:8080/health
# Réponse: {"status": "ok"}
```

---

## 3. ⚙️ Variables d'Environnement Requises

| Variable | Valeur par défaut | Description |
| :--- | :--- | :--- |
| `PORT` / `APP_PORT` | `8080` | Port interne d'écoute de l'application |
| `MONGO_URL` | `mongodb://mongo:27017` | Chaîne de connexion au serveur MongoDB dédié |
| `MONGO_DB` | `geo_db` | Nom de la base de données du microservice |
| `KEYCLOAK_REALM_PUBLIC_KEY` | *(fournie par Keycloak)* | Clé publique RSA du Realm `parentconnect` (RS256) |
| `JWT_ALGORITHM` | `RS256` | Algorithme de signature des tokens |
| `INTERNAL_API_KEY` | `parentconnect-internal-geo-secret-key-32ch` | Clé secrète partagée pour requêtes inter-services cluster |
| `EUREKA_ENABLED` | `true` | Active ou désactive l'enregistrement Eureka |
| `EUREKA_SERVER_URL` | `http://eureka-server:8761/eureka/` | URL du serveur Eureka |
| `EUREKA_APP_NAME` | `PARENTCONNECT-GEO-SERVICE` | Nom du service dans le catalogue Eureka |
| `EUREKA_INSTANCE_HOST` | `geo-service` | Hostname réseau du service dans Docker |
| `EUREKA_INSTANCE_PORT` | `8080` | Port exposé à Eureka |
| `RABBITMQ_HOST` | `rabbitmq` | Hôte du broker RabbitMQ |
| `RABBITMQ_PORT` | `5672` | Port AMQP |
| `RABBITMQ_EXCHANGE` | `parentconnect.topic` | Topic Exchange partagé |
| `RABBITMQ_EVENTS_QUEUE` | `geo_events_queue` | Queue de consommation propre à ce service |
| `LOCATION_BLUR_M` | `200` | Rayon de floutage HMAC de confidentialité (mètres) |
| `BLUR_SALT` | *(secret)* | Sel cryptographique pour le floutage stable par parent |

---

## 4. 🛡️ Authentification & Double Mode de Sécurité

### Mode 1 : Relais Gateway (Haute Performance & Zéro Latence Crypto)
Si l'API Gateway effectue la vérification cryptographique en amont :
- En-têtes attendus transmis par la Gateway :
  * `X-Gateway-Auth: verified`
  * `X-User-Id: <user_id>` (ex: `usr_123`)
  * `X-User-Role: <role>` (ex: `ADMIN`, `PARENT`, `PROFESSIONAL`)
- Le microservice fait confiance à cette identité sans recalculer la signature JWT.

### Mode 2 : Direct (Validation JWT Bearer RS256)
Si la requête arrive avec un Bearer standard (`Authorization: Bearer <token>`) :
- Valide la signature asymétrique `RS256` via `KEYCLOAK_REALM_PUBLIC_KEY`.
- Extrait l'identifiant utilisateur depuis `sub` ou `preferred_username`.
- Extrait les rôles depuis `realm_access.roles` (ex: `ADMIN`, `PARENT`, `PROFESSIONAL`).

---

## 5. 🌐 Contrats d'API — Endpoints Publics (Passant par le Gateway)

Tous ces endpoints sont exposés sur le préfixe `/api/geo/` :

### A. Quartiers (`/api/geo/neighborhoods`)
- `GET /api/geo/neighborhoods` (Authentifié) : Liste paginée des quartiers.
- `GET /api/geo/neighborhoods/{id}` (Authentifié) : Détail d'un quartier par ID.
- `GET /api/geo/neighborhoods/by-point?lat=36.80&lng=10.18` (Authentifié) : Détection spatiale (`$geoIntersects`).
- `POST /api/geo/neighborhoods` (**`ADMIN`** uniquement) : Création d'un quartier avec polygone.

### B. Positions & Recherche de Proximité (`/api/geo/locations`)
- `POST /api/geo/locations` (Authentifié) : Enregistre la position avec **floutage HMAC automatique (~200m)**.
  ```json
  // Request Body
  { "lat": 36.8065, "lng": 10.1815 }
  // Response 200 OK
  { "user_id": "usr_alice", "blurred_location": { "type": "Point", "coordinates": [10.1832, 36.8078] }, "neighborhood_id": "neigh_123" }
  ```
- `GET /api/geo/locations/me` (Authentifié) : Récupère la position floutée de l'appelant.
- `GET /api/geo/nearby?lat=36.80&lng=10.18&radius=3000` (Authentifié) :
  Parents dans le rayon donné. **Totalement anonymisé**, distance arrondie à 100m près, sans coordonnées ni identité exposée.
- `GET /api/geo/users/{id}/proximity` (Authentifié) : Calcule la distance relative arrondie en mètres entre l'appelant et un autre utilisateur.

### C. Vérification d'Adresses (`/api/geo/addresses`)
- `POST /api/geo/addresses/verify` (Authentifié) : Dépose une demande de validation d'adresse.
- `POST /api/geo/addresses/{id}/validate` (Authentifié) : Validation de l'adresse par un voisin certifié (seuil = 2 validations pour passer `verified`).

### D. Cercles de Confiance (`/api/geo/circles`)
- `GET /api/geo/circles` (Authentifié) : Cercles de l'utilisateur (`close`, `neighborhood`, `all`).
- `POST /api/geo/circles` (Authentifié) : Mise à jour des membres d'un cercle.

### E. Points de Rencontre Sécurisés (`/api/geo/meeting-points`)
- `GET /api/geo/meeting-points?neighborhoodId=...` (Authentifié) : Liste des lieux sûrs (parcs, crèches).
- `POST /api/geo/meeting-points` (**`ADMIN`** uniquement) : Déclare un nouveau lieu sûr.

---

## 6. 🔒 Contrats d'API — Endpoints Internes (Inter-Services Cluster Uniquement)

Ces endpoints ne sont **JAMAIS** exposés au Frontend ni routés par l'API Gateway public. Ils nécessitent l'en-tête `X-Internal-Key: parentconnect-internal-geo-secret-key-32ch`.

- `GET /internal/geo/users-within?lat=...&lng=...&radius=...`
  Utilisé par les microservices *Babysitting*, *Marketplace* ou *Events* pour trouver les IDs des parents éligibles sans divulguer leurs coordonnées géographiques précises.
- `GET /internal/geo/distance?user_a=...&user_b=...`
  Calcule la distance exacte entre 2 utilisateurs pour la logistique inter-services.

---

## 7. 📬 Messagerie Événementielle RabbitMQ

- **Exchange** : `parentconnect.topic`
- **Événements Publiés** :
  1. `geo.address.verified` : Émis dès qu'une adresse atteint le seuil requis de 2 validations voisines.
     ```json
     {
       "event_id": "uuid-v4",
       "type": "geo.address.verified",
       "version": 1,
       "occurred_at": "2026-11-11T12:00:00Z",
       "data": {
         "user_id": "usr_alice",
         "neighborhood_id": "neigh_lafayette"
       }
     }
     ```
  2. `geo.neighbor.joined` : Émis lorsqu'un utilisateur enregistre une position associée à un quartier.
- **Événements Consommés** :
  * Queue : `geo_events_queue` liée à `parentconnect.topic` sur `identity.user_registered`.
  * Initialise de manière idempotente l'entrée `user_locations` (sans coordonnées) lors de l'inscription d'un nouvel utilisateur.

