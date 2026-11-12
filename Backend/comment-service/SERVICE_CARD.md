# 📋 SERVICE CARD — Comment Service

## 1. Informations Générales
* **Nom du Microservice :** `comment-service`
* **Technologie :** Laravel 12.0 (PHP 8.2 CLI Alpine)
* **Port Interne Conteneur :** `8080` (écoute sur `0.0.0.0`)
* **Port Hôte / Externe Local :** `8002`
* **Routes API Gateway :** `/api/posts/*/comments`, `/api/comments/**`
* **Statut :** Prêt pour intégration

---

## 2. Endpoints API & Méthodes HTTP

| Méthode | Endpoint | Rôle Requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/health` | Public | Vérification de l'état de santé du conteneur |
| `GET` | `/api/posts/{id}/comments` | Public | Récupération des commentaires publiés pour un post donné |
| `GET` | `/api/comments/{id}` | Public | Consultation d'un commentaire par son ID |
| `POST` | `/api/posts/{id}/comments` | `PARENT`, `PROFESSIONAL`, `ADMIN` | Ajout d'un commentaire sous un post |
| `PUT` | `/api/comments/{id}` | Auteur du commentaire | Modification d'un commentaire |
| `DELETE` | `/api/comments/{id}` | Auteur OU `ADMIN` | Suppression d'un commentaire |

---

## 3. Exemples de Requêtes & Réponses JSON

### 3.1 Création d'un Commentaire (`POST /api/posts/1/comments`)
**Headers requis :**
```http
Authorization: Bearer <token_keycloak_rs256>
Content-Type: application/json
```
**Request Body :**
```json
{
  "content": "Merci pour ces précieux conseils ! Nous allons tester le rituel du coucher ce soir."
}
```
**Response (`201 Created`) :**
```json
{
  "id": 1,
  "post_id": 1,
  "author_id": "parent_test",
  "content": "Merci pour ces précieux conseils ! Nous allons tester le rituel du coucher ce soir.",
  "status": "published",
  "created_at": "2026-11-10T12:05:00.000000Z",
  "updated_at": "2026-11-10T12:05:00.000000Z"
}
```

---

## 4. Configuration Base de Données
* **SGBD :** PostgreSQL 16
* **Base de données :** `comment_db`
* **Table principale :** `comments`
  * `id` : BIGINT (Primary Key, Auto-increment)
  * `post_id` : BIGINT (Indexé, référence l'ID du post)
  * `author_id` : VARCHAR(255) (Indexé, ID utilisateur Keycloak)
  * `content` : TEXT
  * `status` : VARCHAR(50) (default: `published`)
  * `timestamps` & `soft_deletes`

---

## 5. Variables d'Environnement Clés
* `APP_PORT=8080`
* `DB_DATABASE=comment_db`
* `EUREKA_APP_NAME=parentconnect-comment`
* `EUREKA_PORT=8080`
* `KEYCLOAK_REALM_PUBLIC_KEY=<clé_publique>`
* `RABBITMQ_QUEUE=comment_events_queue`

---

## 6. Messagerie RabbitMQ (Contrat Événements)
* **Exchange :** `parentconnect.topic`
* **Événements publiés :**
  * `comment.created` : `{"event": "comment.created", "comment_id": 1, "post_id": 1, "author_id": "parent_test"}`
  * `comment.deleted` : `{"event": "comment.deleted", "comment_id": 1}`
* **Événements consommés :**
  * `post.deleted` : Nettoyage / désactivation des commentaires rattachés au post supprimé.

---

## 7. Demandes à l'Intégrateur
1. **Ordre de routage Gateway critique :** Déclarer la route `/api/posts/*/comments` avant la route générale `/api/posts/**` dans `application.yml` du Gateway.
2. **Transfert d'en-têtes :** Propager `X-Gateway-Auth: verified`, `X-User-Id`, `X-User-Role`.

