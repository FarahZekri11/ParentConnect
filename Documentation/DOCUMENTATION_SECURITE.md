# 🔐 Documentation de Sécurité — ParentConnect Microservices

> **Architecture sécurisée avec Keycloak (IdP central) + API Gateway + Spring Security + Laravel JWT**  
> Version finale — Projet académique — Applications Web Distribuées

---

## 📋 Table des matières

1. [Architecture de sécurité globale](#1-architecture-de-sécurité-globale)
2. [Fonctionnement de JWT](#2-fonctionnement-de-jwt)
3. [Keycloak — Serveur d'identité](#3-keycloak--serveur-didentité)
4. [Sécurité de l'API Gateway](#4-sécurité-de-lapi-gateway)
5. [Sécurité des Microservices Laravel](#5-sécurité-des-microservices-laravel)
6. [Gestion des rôles et autorisations](#6-gestion-des-rôles-et-autorisations)
7. [Parcours complet d'une requête](#7-parcours-complet-dune-requête)
8. [Configuration Keycloak — Guide étape par étape](#8-configuration-keycloak--guide-étape-par-étape)
9. [Tests de sécurité — 8 scénarios obligatoires](#9-tests-de-sécurité--8-scénarios-obligatoires)
10. [Fichiers créés et modifiés](#10-fichiers-créés-et-modifiés)
11. [Commandes de démarrage](#11-commandes-de-démarrage)

---

## 1. Architecture de sécurité globale

```
┌────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Postman / App)                       │
│                                                                      │
│  1. POST /token → Keycloak  (obtenir un JWT RS256)                  │
│  2. GET/POST /api/...       → API Gateway (avec Bearer token)       │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                KEYCLOAK  (IdP)  — port 8180                         │
│                                                                      │
│  • Émet des tokens JWT RS256 signés                                  │
│  • Gère les utilisateurs : admin_test, parent_test, pro_test        │
│  • Gère les rôles : ADMIN, PARENT, PROFESSIONAL                     │
│  • Realm : parentconnect                                             │
│  • Client : parentconnect-gateway                                   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ Clé publique RS256 (JWKS)
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                 API GATEWAY  — port 8080                            │
│                 (Spring Cloud Gateway + JwtAuthenticationFilter)    │
│                                                                      │
│  JwtUtil.validateToken(token)                                        │
│    ├─ RS256 → verifyRsaSignature() → clé publique Keycloak         │
│    └─ HS256 → verifyHmacSignature() → JWT_SECRET                   │
│                                                                      │
│  JwtAuthenticationFilter :                                           │
│    ├─ Routes publiques → passe directement                          │
│    ├─ Token invalide   → 401 Unauthorized                           │
│    ├─ Rôle insuffisant → 403 Forbidden                              │
│    └─ Token valide     → ajoute X-Gateway-Auth, X-User-Id,         │
│                           X-User-Role, X-User-Name                  │
│                           → transmet au microservice                │
└────────────┬───────────┬───────────┬───────────┬────────────────────┘
             │           │           │           │
   lb://     │           │           │           │
 (Eureka)    ▼           ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│user-svc  │ │post-svc  │ │comment   │ │category  │ │report    │
│:8005     │ │:8001     │ │:8002     │ │:8003     │ │:8004     │
│ Laravel  │ │ Laravel  │ │ Laravel  │ │ Laravel  │ │ Laravel  │
│ JwtAuth  │ │ JwtAuth  │ │ JwtAuth  │ │ JwtAuth  │ │ JwtAuth  │
│ RS256    │ │ RS256    │ │ RS256    │ │ RS256    │ │ RS256    │
│ +HS256   │ │ +HS256   │ │ +HS256   │ │ +HS256   │ │ +HS256   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
        └───────────── Eureka Server :8761 ──────────────────┘
```

### Principe de sécurité en deux couches

| Couche | Composant | Responsabilité |
|--------|-----------|----------------|
| **1ère couche** | API Gateway | Validation de la signature JWT, contrôle RBAC sur les routes, enrichissement des en-têtes |
| **2ème couche** | Microservices Laravel | Vérification secondaire du token ou des en-têtes Gateway, contrôle d'accès local |

---

## 2. Fonctionnement de JWT

### Structure d'un JWT

Un JWT (JSON Web Token) est composé de **3 parties séparées par des points** :

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9    ← En-tête (Header) - Base64URL
.
eyJzdWIiOiJhZG1pbl90ZXN0IiwicmVhbG1fYWNjZXNzIjp7InJvbGVzIjpbIkFETUlOIl19fQ
                                          ← Payload (Claims) - Base64URL
.
MEUCIQDxxx...                             ← Signature RSA ou HMAC
```

### Contenu du payload Keycloak

```json
{
  "sub": "d2a7c3e1-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "preferred_username": "admin_test",
  "email": "admin@parentconnect.fr",
  "realm_access": {
    "roles": ["ADMIN", "offline_access"]
  },
  "resource_access": {
    "parentconnect-gateway": {
      "roles": ["ADMIN"]
    }
  },
  "exp": 1731240000,
  "iat": 1731236400,
  "iss": "http://localhost:8180/realms/parentconnect"
}
```

### RS256 vs HS256

| | RS256 (Keycloak) | HS256 (Custom) |
|---|---|---|
| **Algorithme** | RSA — asymétrique | HMAC-SHA256 — symétrique |
| **Signataire** | Keycloak (clé privée) | user-service (secret partagé) |
| **Vérification** | Clé publique RSA | Même secret |
| **Sécurité** | ✅ Haute (clés différentes) | ⚠️ Moyenne (secret partagé) |
| **Usage** | Production (Keycloak) | Développement/Legacy |

---

## 3. Keycloak — Serveur d'identité

### Rôle de Keycloak

Keycloak est un **serveur d'identité open-source** (Identity Provider / IdP). Dans notre architecture :

- Il est la **seule autorité** pour émettre des tokens valides
- Les microservices vérifient les tokens **sans appeler Keycloak à chaque requête** (vérification locale avec la clé publique)
- Il gère les utilisateurs, les rôles, les sessions, le renouvellement de tokens

### Flux d'obtention d'un token (Resource Owner Password Credentials)

```
Client                 Keycloak (port 8180)
  │                         │
  │  POST /realms/parentconnect/protocol/openid-connect/token
  │  Body: grant_type=password&client_id=parentconnect-gateway
  │        &username=admin_test&password=Admin@2026&scope=openid
  │ ─────────────────────────────────────────────────────────► │
  │                         │
  │  200 OK                 │
  │  { "access_token": "eyJhbGc...", "expires_in": 300, ... }  │
  │ ◄──────────────────────────────────────────────────────── │
```

### Composants Keycloak configurés

| Composant | Valeur |
|-----------|--------|
| Realm | `parentconnect` |
| Client ID | `parentconnect-gateway` |
| Algorithme tokens | RS256 |
| Port | 8180 |
| URL admin | http://localhost:8180/admin |
| Token URL | http://localhost:8180/realms/parentconnect/protocol/openid-connect/token |
| JWKS URL | http://localhost:8180/realms/parentconnect/protocol/openid-connect/certs |

---

## 4. Sécurité de l'API Gateway

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| [`JwtUtil.java`](api-gateway/src/main/java/com/parentconnect/gateway/security/JwtUtil.java) | Validation des tokens JWT (RS256 + HS256) |
| [`JwtAuthenticationFilter.java`](api-gateway/src/main/java/com/parentconnect/gateway/security/JwtAuthenticationFilter.java) | Filtre global Spring Cloud Gateway |
| [`application.yml`](api-gateway/src/main/resources/application.yml) | Configuration routes, Keycloak, Eureka |

### Configuration `application.yml` — Clé Keycloak

```yaml
keycloak:
  realm: ${KEYCLOAK_REALM:parentconnect}
  auth-server-url: ${KEYCLOAK_AUTH_SERVER_URL:http://localhost:8180}
  realm-public-key: ${KEYCLOAK_REALM_PUBLIC_KEY:<VOTRE_CLE_PUBLIQUE_RS256>}
```

### Logique de JwtUtil.java

```
validateToken(token)
  ├── Extraire l'en-tête JWT → lire le champ "alg"
  ├── Si alg = "RS256" → verifyRsaSignature()
  │     └── Décoder la clé publique Keycloak (Base64 DER → X509)
  │         Vérifier la signature RSA-SHA256
  ├── Si alg = "HS256" → verifyHmacSignature()
  │     └── Recalculer HMAC avec JWT_SECRET
  │         Comparer en temps constant (MessageDigest.isEqual)
  └── Vérifier l'expiration (claim "exp")
      └── Retourner VALID / EXPIRED / INVALID_SIGNATURE / MALFORMED
```

### Routes publiques (sans authentification requise)

```
GET  /api/posts
GET  /api/posts/{id}
GET  /api/posts/{id}/comments
GET  /api/categories
GET  /api/categories/{id}
POST /api/auth/login
POST /api/auth/register
GET  /actuator/health
```

### Routes protégées et rôles requis

```
POST   /api/posts              → PARENT, PROFESSIONAL, ADMIN
PUT    /api/posts/{id}         → Propriétaire ou ADMIN
DELETE /api/posts/{id}         → ADMIN
POST   /api/posts/{id}/comments → PARENT, PROFESSIONAL, ADMIN
POST   /api/categories         → ADMIN uniquement
DELETE /api/categories/{id}    → ADMIN uniquement
GET    /api/admin/reports      → ADMIN uniquement
POST   /api/posts/{id}/report  → PARENT, PROFESSIONAL, ADMIN
GET    /api/users              → ADMIN uniquement
```

### En-têtes ajoutés par le Gateway

Après validation du token, le Gateway enrichit la requête avant de la transmettre :

```http
X-Gateway-Auth: verified
X-User-Id:      admin_test
X-User-Role:    ADMIN
X-User-Name:    Admin Test
```

---

## 5. Sécurité des Microservices Laravel

### Fichier : `app/Http/Middleware/JwtAuth.php`

Présent dans les 5 services : `user-service`, `post-service`, `comment-service`, `category-service`, `report-service`.

### Logique d'authentification (3 cas)

```
Requête entrante
   │
   ├─ Authorization: Bearer <token> ?
   │      │
   │      ├─ Lire alg dans l'en-tête JWT (sans valider la signature)
   │      ├─ RS256 ? → handleRs256()
   │      │     ├─ Lire KEYCLOAK_REALM_PUBLIC_KEY depuis .env
   │      │     ├─ Convertir Base64 DER → PEM
   │      │     ├─ JWT::decode($token, new Key($pem, 'RS256'))
   │      │     ├─ Extraire preferred_username (Keycloak)
   │      │     └─ Extraire rôle depuis realm_access.roles
   │      │
   │      └─ HS256 ? → handleHs256()
   │            ├─ Lire JWT_SECRET depuis .env
   │            ├─ JWT::decode($token, new Key($secret, 'HS256'))
   │            └─ Extraire sub + role
   │
   ├─ X-Gateway-Auth: verified + X-User-Id présents ?
   │      └─ Requête déjà validée par le Gateway
   │         → Utiliser X-User-Id et X-User-Role directement
   │
   └─ Aucune identité → 401 Unauthorized
```

### Variables d'environnement dans `.env` (tous les services)

```ini
JWT_SECRET=super_secret_parentconnect_jwt_key_2026_community
KEYCLOAK_REALM_PUBLIC_KEY=<clé_publique_RS256_depuis_keycloak>
KEYCLOAK_REALM=parentconnect
KEYCLOAK_AUTH_SERVER_URL=http://localhost:8180
```

> **Important** : La valeur de `KEYCLOAK_REALM_PUBLIC_KEY` doit être **remplacée** par la vraie clé publique de votre instance Keycloak (voir section 8).

---

## 6. Gestion des rôles et autorisations

### Rôles dans le système

| Rôle | Description | Droits |
|------|-------------|--------|
| **ADMIN** | Administrateur de la plateforme | Accès total — gestion catégories, signalements, utilisateurs |
| **PARENT** | Utilisateur standard (parent) | Lecture publique, création de posts et commentaires, signalement |
| **PROFESSIONAL** | Professionnel de la petite enfance | Mêmes droits que PARENT + accès à des ressources spécifiques |

### Matrice d'accès

| Ressource | PARENT | PROFESSIONAL | ADMIN |
|-----------|--------|--------------|-------|
| Lire les posts | ✅ | ✅ | ✅ |
| Créer un post | ✅ | ✅ | ✅ |
| Modifier son post | ✅ | ✅ | ✅ |
| Supprimer n'importe quel post | ❌ | ❌ | ✅ |
| Créer une catégorie | ❌ | ❌ | ✅ |
| Supprimer une catégorie | ❌ | ❌ | ✅ |
| Signaler un contenu | ✅ | ✅ | ✅ |
| Voir tous les signalements | ❌ | ❌ | ✅ |
| Gérer les utilisateurs | ❌ | ❌ | ✅ |

### Codes HTTP retournés

| Situation | Code | Message |
|-----------|------|---------|
| Pas de token | **401** | Unauthorized |
| Token invalide | **401** | Unauthorized (signature incorrecte) |
| Token expiré | **401** | Unauthorized (token expiré) |
| Rôle insuffisant | **403** | Forbidden |
| Accès autorisé | **200/201** | OK / Created |

---

## 7. Parcours complet d'une requête

### Scénario : Création d'un post par un PARENT (token Keycloak RS256)

```
1. CLIENT
   POST http://localhost:8080/api/posts
   Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
   Content-Type: application/json
   Body: { "title": "Mon post", "content": "...", "category_id": 1 }

2. API GATEWAY (port 8080) — JwtAuthenticationFilter
   a) La route /api/posts (POST) est PROTÉGÉE → validation requise
   b) Extraction du token depuis l'en-tête Authorization
   c) Lecture de l'algorithme : alg=RS256 (token Keycloak)
   d) verifyRsaSignature() avec la clé publique Keycloak
      → Signature VALIDE ✓
   e) Vérification de l'expiration : exp > maintenant ✓
   f) Extraction du rôle : realm_access.roles = ["PARENT"] ✓
   g) Vérification RBAC : PARENT peut créer un post ✓
   h) Ajout des en-têtes enrichis :
      X-Gateway-Auth: verified
      X-User-Id: parent_test
      X-User-Role: PARENT
      X-User-Name: Parent Test
   i) Transmission vers post-service (via Eureka : lb://PARENTCONNECT-POST)

3. POST-SERVICE (port 8001) — JwtAuth middleware
   a) L'en-tête X-Gateway-Auth: verified est présent
   b) L-User-Id=parent_test, X-User-Role=PARENT
   c) Authentification acceptée sans re-valider le token JWT
   d) Contrôleur PostController → création du post en base
   e) Réponse 201 Created avec les données du post

4. API GATEWAY
   Transmission de la réponse 201 au client

5. CLIENT
   201 Created — Post créé avec succès
```

### Scénario : Accès refusé — PARENT essaie de créer une catégorie (403)

```
1. CLIENT
   POST http://localhost:8080/api/categories
   Authorization: Bearer <token_PARENT>

2. API GATEWAY
   a) Route /api/categories (POST) → ADMIN requis
   b) Token valide, RS256 OK ✓
   c) Rôle extrait : PARENT
   d) RBAC : PARENT n'a pas le droit sur POST /api/categories
   e) Réponse 403 Forbidden → le gateway bloque, ne transmet PAS

3. CLIENT
   403 Forbidden — Accès refusé
```

---

## 8. Configuration Keycloak — Guide étape par étape

### Pré-requis

- Java 17+ installé
- Keycloak 24.x téléchargé depuis https://www.keycloak.org/downloads (ZIP)
- Extrait dans `C:\keycloak`

### Démarrage

```cmd
cd C:\keycloak\bin
kc.bat start-dev --http-port=8180
```

### Étapes de configuration dans l'interface admin

#### 1. Accéder à la console admin
Ouvrir : http://localhost:8180/admin → créer un compte admin

#### 2. Créer le Realm `parentconnect`
- Cliquer "Create Realm"
- Realm name : `parentconnect` → Create

#### 3. Créer les Rôles du Realm
- Aller dans **Realm Roles** → Create Role
- Créer : `ADMIN`, `PARENT`, `PROFESSIONAL`

#### 4. Créer le Client
- Aller dans **Clients** → Create Client
- Client ID : `parentconnect-gateway`
- Client authentication : OFF (public) ou ON (confidential)
- **Direct Access Grants : ACTIVER** (requis pour password flow)
- Save

#### 5. Créer les utilisateurs de test

| Username | Password | Rôle |
|----------|----------|------|
| `admin_test` | `Admin@2026` | ADMIN |
| `parent_test` | `Parent@2026` | PARENT |
| `pro_test` | `Pro@2026` | PROFESSIONAL |

Pour chaque utilisateur : Users → Create → onglet Role Mappings → assigner le rôle.

#### 6. Récupérer la clé publique RS256

1. Aller dans **Realm Settings** → onglet **Keys**
2. Trouver la ligne avec Algorithme **RS256**
3. Cliquer sur **Public Key** → copier la clé

#### 7. Mettre à jour la clé dans le projet

```bash
# Dans chaque service Laravel (.env) :
KEYCLOAK_REALM_PUBLIC_KEY=<votre_cle_publique_copiee>

# Dans api-gateway/src/main/resources/application.yml :
keycloak:
  realm-public-key: <votre_cle_publique_copiee>
```

Ensuite, recompiler le Gateway et redémarrer tous les services.

---

## 9. Tests de sécurité — 8 scénarios obligatoires

### Prérequis

1. Tous les services démarrés via `start-all.bat`
2. Keycloak configuré (realm + users + roles)
3. Tokens obtenus via la section **0. Keycloak** de la collection Postman

### Les 8 tests

| # | Description | Méthode | Endpoint | Attendu |
|---|-------------|---------|----------|---------|
| 1 | Accès public sans token | GET | /api/posts | **200 OK** |
| 2 | Endpoint protégé sans token | POST | /api/posts | **401 Unauthorized** |
| 3 | Token Keycloak RS256 valide | POST | /api/posts | **201 Created** |
| 4 | Token avec signature falsifiée | POST | /api/posts | **401 Unauthorized** |
| 5 | Token expiré | POST | /api/posts | **401 Unauthorized** |
| 6 | Rôle PARENT sur ressource ADMIN | POST | /api/categories | **403 Forbidden** |
| 7 | Rôle ADMIN sur ressource ADMIN | POST | /api/categories | **201 Created** |
| 8 | Gateway → Microservice fonctionnel | GET | /api/admin/reports | **200 OK** |

### Commandes Postman (import)

Importer le fichier `ParentConnect_Security_Postman_Collection.json` dans Postman.

Ordre d'exécution recommandé :
1. `0.1 Token PARENT` → sauvegarde `keycloak_parent_token`
2. `0.2 Token ADMIN` → sauvegarde `keycloak_admin_token`
3. Dossier `2. Validation des 8 Exigences de Sécurité`

### Tests via curl (alternative)

```bash
# Test 1 : Endpoint public
curl http://localhost:8080/api/posts
# Attendu : 200 OK

# Test 2 : Sans token
curl -X POST http://localhost:8080/api/posts \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","content":"...", "category_id":1}'
# Attendu : 401 Unauthorized

# Test 3 : Obtenir un token Keycloak
TOKEN=$(curl -s -X POST \
  http://localhost:8180/realms/parentconnect/protocol/openid-connect/token \
  -d "grant_type=password&client_id=parentconnect-gateway&username=parent_test&password=Parent@2026&scope=openid" \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Test 3 : Avec token valide
curl -X POST http://localhost:8080/api/posts \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"title":"Conseil sommeil","content":"Routine bain + berceuse","category_id":1,"type":"question"}'
# Attendu : 201 Created
```

---

## 10. Fichiers créés et modifiés

### Fichiers créés ou modifiés dans cette session

| Fichier | Type | Description |
|---------|------|-------------|
| `api-gateway/src/main/java/.../security/JwtUtil.java` | Java | Validation RS256 (Keycloak) + HS256 — auto-détection |
| `api-gateway/src/main/java/.../security/JwtAuthenticationFilter.java` | Java | Filtre global Spring Cloud Gateway + RBAC |
| `api-gateway/src/main/resources/application.yml` | YAML | Routes, config Keycloak, Eureka |
| `api-gateway/target/api-gateway-secured.jar` | JAR | JAR compilé avec toutes les mises à jour Keycloak |
| `*/app/Http/Middleware/JwtAuth.php` | PHP | Middleware JWT (RS256 + HS256) pour 5 services |
| `*/.env` | ENV | Variables `KEYCLOAK_REALM_PUBLIC_KEY` ajoutées (5 services) |
| `start-all.bat` | Batch | Démarrage avec Keycloak en premier |
| `run_all_security_tests.bat` | Batch | Suite de tests mise à jour |
| `update-gateway-jar.bat` | Batch | Script de remplacement du JAR |
| `setup-keycloak-guide.bat` | Batch | Guide interactif de configuration Keycloak |
| `ParentConnect_Security_Postman_Collection.json` | JSON | Collection Postman avec section Keycloak |
| `DOCUMENTATION_SECURITE.md` | Markdown | Ce document |

---

## 11. Commandes de démarrage

### Démarrage complet (avec Keycloak)

```cmd
# 1. Lancer tous les services
start-all.bat

# 2. Vérifier que Keycloak est prêt
# Console admin : http://localhost:8180/admin
# Eureka dashboard : http://localhost:8761

# 3. Exécuter les tests unitaires Java
run_all_security_tests.bat
```

### Démarrage manuel (ordre recommandé)

```cmd
# Terminal 1 : Keycloak
cd C:\keycloak\bin
kc.bat start-dev --http-port=8180

# Terminal 2 : Eureka
cd eureka-server
java -jar target\eureka-server-1.0.0.jar

# Terminal 3 : API Gateway
cd api-gateway
java -jar target\api-gateway-secured.jar

# Terminals 4-8 : Microservices Laravel
cd user-service && php artisan serve --port=8005
cd Backend/post-service && php artisan serve --port=8001
cd Backend/comment-service && php artisan serve --port=8002
cd Backend/category-service && php artisan serve --port=8003
cd Backend/report-service && php artisan serve --port=8004
```

### Mise à jour du JAR API Gateway (après arrêt de tous les services)

```cmd
# Méthode 1 : Script automatique
update-gateway-jar.bat

# Méthode 2 : Manuel
copy /Y api-gateway\target\api-gateway-secured.jar api-gateway\target\api-gateway-1.0.0-SNAPSHOT.jar
```

### Obtenir un token Keycloak (PowerShell)

```powershell
# Token PARENT
$body = "grant_type=password&client_id=parentconnect-gateway&username=parent_test&password=Parent@2026&scope=openid"
$response = Invoke-RestMethod -Method POST -Uri "http://localhost:8180/realms/parentconnect/protocol/openid-connect/token" -ContentType "application/x-www-form-urlencoded" -Body $body
$response.access_token

# Token ADMIN
$body = "grant_type=password&client_id=parentconnect-gateway&username=admin_test&password=Admin@2026&scope=openid"
$response = Invoke-RestMethod -Method POST -Uri "http://localhost:8180/realms/parentconnect/protocol/openid-connect/token" -ContentType "application/x-www-form-urlencoded" -Body $body
$response.access_token
```

---

## 🎯 Différence entre la sécurité du Gateway et celle des Microservices

| Aspect | API Gateway | Microservices Laravel |
|--------|-------------|----------------------|
| **Rôle** | Point d'entrée unique | Vérification secondaire |
| **Validation JWT** | Toujours (toutes les requêtes) | Si token direct ou en-têtes Gateway |
| **RBAC** | Routes protégées globalement | Logique métier spécifique |
| **Avantage** | Évite le code dupliqué | Défense en profondeur |
| **Communication** | Via en-têtes enrichis | Reçoit X-Gateway-Auth |

> **Principe DRY** : Le Gateway valide le token une seule fois. Les microservices font confiance aux en-têtes `X-Gateway-Auth: verified` et n'ont pas besoin de re-valider la signature JWT à chaque appel interne — ce qui améliore les performances et réduit la duplication.

---

*Documentation générée pour la soutenance du module Applications Web Distribuées.*  
*Architecture : Keycloak 24.x + Spring Cloud Gateway 4.x + Laravel 12 + Eureka*
