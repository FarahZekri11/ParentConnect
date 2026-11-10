# 📋 SERVICE CARD — Report Service

## 1. Informations Générales
* **Nom du Microservice :** `report-service`
* **Technologie :** Laravel 12.0 (PHP 8.2 CLI Alpine)
* **Port Interne Conteneur :** `8080` (écoute sur `0.0.0.0`)
* **Port Hôte / Externe Local :** `8004`
* **Routes API Gateway :** `/api/posts/*/report`, `/api/comments/*/report`, `/api/admin/reports/**`
* **Statut :** Prêt pour intégration

---

## 2. Endpoints API & Méthodes HTTP

| Méthode | Endpoint | Rôle Requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/health` | Public | Vérification de l'état de santé du service |
| `POST` | `/api/posts/{id}/report` | `PARENT`, `PROFESSIONAL`, `ADMIN` | Signaler une publication inappropriée |
| `POST` | `/api/comments/{id}/report` | `PARENT`, `PROFESSIONAL`, `ADMIN` | Signaler un commentaire inapproprié |
| `GET` | `/api/admin/reports` | `ADMIN` uniquement | Consulter la liste de tous les signalements |
| `PATCH` | `/api/admin/reports/{id}` | `ADMIN` uniquement | Mettre à jour le statut d'un signalement (`reviewed`, `rejected`) |

---

## 3. Exemples de Requêtes & Réponses JSON

### 3.1 Signaler un Contenu (`POST /api/posts/1/report`)
**Headers :**
```http
Authorization: Bearer <token_keycloak_parent>
Content-Type: application/json
```
**Request Body :**
```json
{
  "reason": "Contenu inapproprié ou agressif",
  "details": "Ce post ne respecte pas la charte de bienveillance de la communauté."
}
```
**Response (`201 Created`) :**
```json
{
  "id": 1,
  "reporter_id": "parent_test",
  "target_type": "post",
  "target_id": 1,
  "reason": "Contenu inapproprié ou agressif",
  "details": "Ce post ne respecte pas la charte de bienveillance de la communauté.",
  "status": "pending",
  "created_at": "2026-11-10T12:10:00.000000Z"
}
```

### 3.2 Modération par l'Administrateur (`PATCH /api/admin/reports/1`)
**Request Body :**
```json
{
  "status": "reviewed",
  "action_taken": "post_hidden"
}
```
**Response (`200 OK`) :**
```json
{
  "id": 1,
  "status": "reviewed",
  "reviewed_by": "admin_test",
  "updated_at": "2026-11-10T12:15:00.000000Z"
}
```

---

## 4. Configuration Base de Données
* **SGBD :** PostgreSQL 16
* **Base de données :** `report_db`
* **Table principale :** `reports`
  * `id` : BIGINT (Primary Key, Auto-increment)
  * `reporter_id` : VARCHAR(255) (ID utilisateur Keycloak)
  * `target_type` : VARCHAR(50) (`post` ou `comment`)
  * `target_id` : BIGINT (ID de l'entité signalée)
  * `reason` : VARCHAR(255)
  * `details` : TEXT (Nullable)
  * `status` : VARCHAR(50) (default: `pending`)
  * `reviewed_by` : VARCHAR(255) (Nullable, ID de l'admin)
  * `timestamps`

---

## 5. Variables d'Environnement Clés
* `APP_PORT=8080`
* `DB_DATABASE=report_db`
* `EUREKA_APP_NAME=parentconnect-report`
* `EUREKA_PORT=8080`
* `KEYCLOAK_REALM_PUBLIC_KEY=<clé_publique>`
* `RABBITMQ_QUEUE=report_events_queue`

---

## 6. Demandes à l'Intégrateur
1. **Ordre Gateway :** Rediriger `/api/posts/*/report` et `/api/comments/*/report` vers `report-service` avant les routes génériques.
2. **Protection `/api/admin/reports` :** Exiger le rôle `ADMIN` au niveau de l'API Gateway.

