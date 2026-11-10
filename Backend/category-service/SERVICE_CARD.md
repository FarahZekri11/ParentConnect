# 📋 SERVICE CARD — Category Service

## 1. Informations Générales
* **Nom du Microservice :** `category-service`
* **Technologie :** Laravel 12.0 (PHP 8.2 CLI Alpine)
* **Port Interne Conteneur :** `8080` (écoute sur `0.0.0.0`)
* **Port Hôte / Externe Local :** `8003`
* **Route API Gateway :** `/api/categories/**`
* **Statut :** Prêt pour intégration

---

## 2. Endpoints API & Méthodes HTTP

| Méthode | Endpoint | Rôle Requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/health` | Public | Vérification de l'état de santé du service |
| `GET` | `/api/categories` | Public | Liste de toutes les catégories de discussions |
| `GET` | `/api/categories/{id}` | Public | Détail d'une catégorie par son ID |
| `POST` | `/api/categories` | `ADMIN` uniquement | Création d'une nouvelle catégorie |
| `PUT` | `/api/categories/{id}` | `ADMIN` uniquement | Modification d'une catégorie |
| `DELETE` | `/api/categories/{id}` | `ADMIN` uniquement | Suppression d'une catégorie |

---

## 3. Exemples de Requêtes & Réponses JSON

### 3.1 Création d'une Catégorie (`POST /api/categories`) — Rôle ADMIN requis
**Headers :**
```http
Authorization: Bearer <token_keycloak_admin>
Content-Type: application/json
```
**Request Body :**
```json
{
  "name": "Alimentation et Diversification",
  "slug": "alimentation-diversification",
  "description": "Conseils, recettes et astuces pour débuter la diversification alimentaire."
}
```
**Response (`201 Created`) :**
```json
{
  "id": 1,
  "name": "Alimentation et Diversification",
  "slug": "alimentation-diversification",
  "description": "Conseils, recettes et astuces pour débuter la diversification alimentaire.",
  "created_at": "2026-11-10T12:00:00.000000Z",
  "updated_at": "2026-11-10T12:00:00.000000Z"
}
```

### 3.2 Tentative d'un PARENT (`POST /api/categories`)
**Response (`403 Forbidden`) :**
```json
{
  "status": 403,
  "error": "Forbidden",
  "message": "Accès réservé aux administrateurs."
}
```

---

## 4. Configuration Base de Données
* **SGBD :** PostgreSQL 16
* **Base de données :** `category_db`
* **Table principale :** `categories`
  * `id` : BIGINT (Primary Key, Auto-increment)
  * `name` : VARCHAR(255)
  * `slug` : VARCHAR(255) (Unique)
  * `description` : TEXT (Nullable)
  * `timestamps`

---

## 5. Variables d'Environnement Clés
* `APP_PORT=8080`
* `DB_DATABASE=category_db`
* `EUREKA_APP_NAME=parentconnect-category`
* `EUREKA_PORT=8080`
* `KEYCLOAK_REALM_PUBLIC_KEY=<clé_publique>`
* `RABBITMQ_QUEUE=category_events_queue`

---

## 6. Demandes à l'Intégrateur
1. **Routage Gateway :** Rediriger `/api/categories/**` vers `lb://PARENTCONNECT-CATEGORY`.
2. **Contrôle d'accès Gateway :** Sécuriser `POST`, `PUT`, `DELETE` sur `/api/categories` pour exiger le rôle `ADMIN` dès la couche Gateway.

