# ParentConnect — Sécurisation avec Keycloak (OAuth2 / OIDC)

Ce guide détaille la mise en place, la configuration et le fonctionnement de la sécurité centralisée **Keycloak** pour la plateforme **ParentConnect** :
1. **Sécurisation de l'API Gateway avec Keycloak** (Port 8080)
2. **Sécurisation du Microservice Marketplace en tant que Resource Server Keycloak** (Port 3002)

---

## 1. Vue d'Ensemble de l'Architecture de Sécurité

```
                   [ Navigateur / Client ]
                             │
                             ▼ (1. Authentification)
                   ┌──────────────────┐
                   │     KEYCLOAK     │ (Port 8180)
                   │  Realm: parent-  │
                   │     connect      │
                   └─────────┬────────┘
                             │ (2. Émission Jeton JWT Bearer)
                             ▼
                     [ API GATEWAY ] (Port 8080)
               ┌─────────────────────────────┐
               │ - Vérification validité JWT │
               │ - Token Relay (Authorization)│
               │ - Ingestion x-user-id / rôles│
               └─────────────┬───────────────┘
                             │
                             ▼ (3. Routage sécurisé)
                [ MICROSERVICE MARKETPLACE ] (Port 3002)
               ┌─────────────────────────────┐
               │ - JwtAuthGuard (Keycloak)   │
               │ - RolesGuard (@Roles('USER')│
               │ - Isolation données MongoDB │
               └─────────────────────────────┘
```

---

## 2. Configuration du Realm Keycloak

Le fichier [`parentconnect-realm.json`](./parentconnect-realm.json) contient la configuration pré-paramétrée :
- **Realm** : `parentconnect`
- **Clients déclarés** :
  - `marketplace-service` : *Bearer-only* (Resource Server OAuth2 pour notre microservice NestJS).
  - `api-gateway` : Passerelle mandataire avec redirection.
  - `frontend-parentconnect` : Client public pour l'application Angular.
- **Rôles Realm** : `USER`, `ADMIN`
- **Utilisateurs de test** :
  - Identifiant : `farah` / Mot de passe : `password` (Rôles: `USER`, `ADMIN`)
  - Identifiant : `parent_test` / Mot de passe : `password` (Rôles: `USER`)

---

## 3. Démarrage de Keycloak

### Via Docker Compose :
```bash
cd Backend
docker-compose up -d keycloak
```
- Console d'administration : **`http://localhost:8180`**
- Identifiants Admin : `admin` / `admin`
- Well-Known OpenID Configuration : `http://localhost:8180/realms/parentconnect/.well-known/openid-configuration`
- Endpoint des certificats JWKS : `http://localhost:8180/realms/parentconnect/protocol/openid-connect/certs`

---

## 4. Obtention d'un Jeton JWT Keycloak (Direct Grant)

Pour tester vos requêtes sécurisées via cURL, Postman ou Swagger :

```bash
curl -X POST "http://localhost:8180/realms/parentconnect/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=api-gateway" \
  -d "username=farah" \
  -d "password=password"
```

**Réponse Keycloak reçue :**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6...",
  "expires_in": 300,
  "refresh_token": "eyJhbGciOiJIUzUxMiIsIn...",
  "token_type": "Bearer"
}
```

---

## 5. Appel Sécurisé de l'API Gateway (Port 8080)

Une fois le jeton obtenu, testez une action protégée (ex: création d'annonce) :

```bash
curl -X POST "http://localhost:8080/api/listings" \
  -H "Authorization: Bearer <VOTRE_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Lit parapluie Babybjörn",
    "description": "Lit de voyage très compact et léger, parfait état.",
    "category": "FURNITURE",
    "condition": "LIKE_NEW",
    "type": "LENDING",
    "price": 0
  }'
```

La passerelle valide le jeton auprès de Keycloak, injecte les en-têtes d'identité (`x-user-id`, `x-user-email`) et transmet la requête au microservice Marketplace !
