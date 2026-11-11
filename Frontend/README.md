# ParentConnect – Application Frontend

Application Frontend moderne pour la plateforme communautaire ParentConnect, développée avec **React 18**, **TypeScript**, **Vite** et **Tailwind CSS**.

---

## 🏛 Architecture d'Intégration & Règle d'or

> **Règle absolue** : Le Frontend n'appelle **JAMAIS** directement les ports internes des microservices (8001, 8002, 8003, 8085...).
> **Toutes les requêtes transitent obligatoirement par l'API Gateway centralisé** : `http://localhost:8080`.

L'URL de base est paramétrable via la variable d'environnement :
```bash
VITE_API_BASE_URL=http://localhost:8080
```

---

## 🔐 Sécurité & Authentification

- **Stockage de session** : Le token JWT Bearer (émis par Keycloak ou l'endpoint `/api/auth/login`) est stocké de manière sécurisée dans `sessionStorage`.
- **Intercepteur HTTP (`src/api/client.ts`)** :
  - **Requête** : Injection systématique de l'en-tête `Authorization: Bearer <access_token>`.
  - **Réponse HTTP 401 Unauthorized** : Purge du token expiré ou invalide et redirection automatique vers `/login?redirect=<page_cible>`.
  - **Réponse HTTP 403 Forbidden** : Notification d'accès refusé via bandeau global sans déconnexion de l'utilisateur (ex: rôle `PARENT` tentant d'accéder à la modération `ADMIN`).

---

## 📋 Endpoints consommés via l'API Gateway (`http://localhost:8080`)

| Fonctionnalité | Méthode & URL | Rôle Requis | Description |
|---|---|---|---|
| Inscription | `POST /api/auth/register` | Public | Création d'un compte (PARENT, PROFESSIONAL, ADMIN) |
| Connexion | `POST /api/auth/login` | Public | Obtention du token JWT Bearer |
| Mon Profil | `GET /api/auth/me` | Authentifié | Données de l'utilisateur connecté |
| Liste des Posts | `GET /api/posts` | Public | Récupération du flux de messages |
| Créer un Post | `POST /api/posts` | `PARENT`, `PROFESSIONAL`, `ADMIN` | Publication d'un nouveau post |
| Commentaires d'un Post | `GET /api/posts/{id}/comments` | Public | Liste des réponses |
| Ajouter un Commentaire | `POST /api/posts/{id}/comments` | `PARENT`, `PROFESSIONAL`, `ADMIN` | Ajout d'une réponse |
| Catégories | `GET /api/categories` | Public | Liste des catégories de discussions |
| Créer une Catégorie | `POST /api/categories` | `ADMIN` uniquement | Administration des thématiques |
| Signaler un Post | `POST /api/posts/{id}/report` | `PARENT`, `PROFESSIONAL`, `ADMIN` | Signalement aux modérateurs |
| Modération Signalements | `GET /api/admin/reports` | `ADMIN` uniquement | Console de traitement des abus |
| Garde d'enfants (Babysitting) | `GET / POST /api/babysitting/` | Selon la route | Demandes et consultations de garde |

---

## 🚀 Démarrage en Développement Local

1. **Installer les dépendances** :
   ```bash
   npm install
   ```

2. **Démarrer le serveur de développement Vite** :
   ```bash
   npm run dev
   ```
   L'application est accessible sur : `http://localhost:5173`.
   Le proxy Vite redirige automatiquement `/api/*` vers `http://localhost:8080`.

---

## 🐳 Déploiement Conteneurisé avec Docker

Le projet inclut un `Dockerfile` multistage optimisé (Node 20 Alpine pour le build + Nginx 1.27 Alpine pour le runtime) et un fichier `docker-compose.frontend.yml` rattaché au réseau partagé `parentconnect-network`.

### Démarrage avec Docker Compose :
```bash
docker compose -f docker-compose.frontend.yml up -d --build
```
L'application est servie par Nginx sur le port standard `80`.
