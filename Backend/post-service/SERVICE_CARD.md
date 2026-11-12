# 📋 SERVICE CARD — Post Service

## 1. Informations Générales
* **Nom du Microservice :** `post-service`
* **Technologie :** Laravel 12.0 (PHP 8.2 CLI Alpine)
* **Port Interne Conteneur :** `8080` (écoute sur `0.0.0.0`)
* **Port Hôte / Externe Local :** `8001`
* **Route API Gateway :** `/api/posts/**`
* **Statut :** Prêt pour intégration

---

## 2. Endpoints API & Méthodes HTTP

| Méthode | Endpoint | Rôle Requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/health` | Public | Vérification de l'état de santé du conteneur |
| `GET` | `/api/posts` | Public | Récupération paginée de toutes les publications |
| `GET` | `/api/posts/{id}` | Public | Consultation détaillée d'un post par son ID |
| `POST` | `/api/posts` | `PARENT`, `PROFESSIONAL`, `ADMIN` | Création d'une nouvelle publication ou question |
| `PUT` | `/api/posts/{id}` | Auteur du post OU `ADMIN` | Modification d'une publication existante |
| `DELETE` | `/api/posts/{id}` | `ADMIN` uniquement | Suppression définitive d'une publication |

---

## 3. Exemples de Requêtes & Réponses JSON

### 3.1 Création d'un Post (`POST /api/posts`)
**Headers requis :**
```http
Authorization: Bearer <token_keycloak_rs256>
Content-Type: application/json
```
**Request Body :**
```json
{
  "category_id": 1,
  "type": "question",
  "title": "Conseils pour le sommeil d'un nourrisson",
  "content": "Bonjour, mon bébé de 6 mois se réveille fréquemment. Quels rituels appliquez-vous ?"
}
```
**Response (`201 Created`) :**
```json
{
  "id": 1,
  "author_id": "parent_test",
  "category_id": 1,
  "type": "question",
  "title": "Conseils pour le sommeil d'un nourrisson",
  "content": "Bonjour, mon bébé de 6 mois se réveille fréquemment. Quels rituels appliquez-vous ?",
  "status": "published",
  "created_at": "2026-11-10T12:00:00.000000Z",
  "updated_at": "2026-11-10T12:00:00.000000Z"
}
```

### 3.2 Liste des Posts (`GET /api/posts`)
**Response (`200 OK`) :**
```json
[
  {
    "id": 1,
    "author_id": "parent_test",
    "category_id": 1,
    "type": "question",
    "title": "Conseils pour le sommeil d'un nourrisson",
    "content": "Bonjour, mon bébé de 6 mois se réveille fréquemment...",
    "status": "published",
    "created_at": "2026-11-10T12:00:00.000000Z"
  }
]
```

### 3.3 Erreur Rôle Insuffisant (`403 Forbidden`)
```json
{
  "status": 403,
  "error": "Forbidden",
  "message": "Accès refusé. Rôle insuffisant pour cette opération."
}
```

---

## 4. Configuration Base de Données
* **SGBD :** PostgreSQL 16
* **Base de données :** `post_db`
* **Table principale :** `posts`
  * `id` : BIGINT (Primary Key, Auto-increment)
  * `author_id` : VARCHAR(255) (Indexé, référence l'ID / UUID Keycloak)
  * `category_id` : BIGINT (Indexé, nullable)
  * `type` : VARCHAR(50) (default: `post`)
  * `title` : VARCHAR(255)
  * `content` : TEXT
  * `status` : VARCHAR(50) (default: `published`)
  * `timestamps` & `soft_deletes`

---

## 5. Variables d'Environnement

| Variable | Exemple / Défaut | Description |
|----------|-------------------|-------------|
| `APP_NAME` | `Post Service` | Nom de l'application |
| `APP_ENV` | `production` / `local` | Environnement Laravel |
| `APP_PORT` | `8080` | Port d'écoute interne du serveur |
| `DB_CONNECTION` | `pgsql` | Driver de base de données |
| `DB_HOST` | `post-db` (prod) / `127.0.0.1` | Hôte PostgreSQL |
| `DB_PORT` | `5432` | Port PostgreSQL |
| `DB_DATABASE` | `post_db` | Nom de la base |
| `DB_USERNAME` | `postgres` | Utilisateur DB |
| `DB_PASSWORD` | `1234` | Mot de passe DB |
| `AUTO_MIGRATE` | `true` | Exécution automatique des migrations au démarrage |
| `EUREKA_SERVER_URL` | `http://eureka-server:8761/eureka/` | URL du serveur Eureka |
| `EUREKA_APP_NAME` | `parentconnect-post` | Nom d'enregistrement Eureka |
| `KEYCLOAK_REALM_PUBLIC_KEY` | *(clé RSA base64)* | Clé publique de validation des signatures RS256 |
| `RABBITMQ_HOST` | `rabbitmq` | Hôte du broker RabbitMQ |
| `RABBITMQ_PORT` | `5672` | Port de messagerie RabbitMQ |
| `RABBITMQ_QUEUE` | `post_events_queue` | File d'attente d'événements du service |

---

## 6. Découverte de Service (Eureka)
* **Nom d'enregistrement :** `PARENTCONNECT-POST`
* **VIP Address :** `parentconnect-post`
* **Port :** `8080`
* **Health Endpoint :** `/api/health`
* **Heartbeat :** Renouvellement toutes les 30 secondes, bail de 90 secondes.

---

## 7. Sécurité & Keycloak
* **Algorithme JWT :** `RS256` (signature asymétrique Keycloak) avec fallback `HS256`.
* **Identifiant utilisateur :** Extrait depuis `preferred_username` ou `sub` comme `string`.
* **Extraction des rôles :**
  1. `realm_access.roles` (ex: `["PARENT"]`, `["ADMIN"]`)
  2. `resource_access.<client>.roles`
  3. Claim `role` (fallback custom)

---

## 8. Messagerie RabbitMQ (Contrat Événements)
* **Exchange :** `parentconnect.topic` (Topic Exchange)
* **Routing Keys publiées :**
  * `post.created` : Publié lors de la création d'un nouveau post.
    ```json
    {
      "event": "post.created",
      "post_id": 1,
      "author_id": "parent_test",
      "category_id": 1,
      "timestamp": "2026-11-10T12:00:00Z"
    }
    ```
  * `post.deleted` : Publié lors de la suppression d'un post.
* **Queues consommées :** `post_events_queue`

---

## 9. Dépendances Interservices
* **Consomme :**
  * `user-service` : Vérification des auteurs via en-têtes certifiés du Gateway (`X-User-Id`).
  * `category-service` : Validation de l'existence des catégories (`category_id`).
* **Propagé vers :**
  * `comment-service` : Fournit les IDs de posts pour l'attachement des commentaires (`/api/posts/{id}/comments`).
  * `report-service` : Fournit la cible des signalements (`/api/posts/{id}/report`).

---

## 10. Exigences de Ressources (Docker)
* **Mémoire recommandée :** 256 MB (minimum 128 MB)
* **CPU :** 0.5 vCPU

---

## 11. Demandes à l'Intégrateur (Request to Integrator)
1. **Routage Gateway :** S'assurer que les routes `/api/posts/**` et `/api/posts` sont dirigées vers `lb://PARENTCONNECT-POST` ou `http://post-service:8080`.
2. **Ordre de priorité Gateway :** Les routes `/api/posts/*/comments` doivent être routées vers `comment-service` AVANT `/api/posts/**`.
3. **Propagation d'en-têtes :** Le Gateway doit propager `Authorization`, `X-Gateway-Auth: verified`, `X-User-Id`, `X-User-Role`.

