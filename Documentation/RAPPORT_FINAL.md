# ParentConnect — Rapport final : audit, corrections et améliorations

Toutes les modifications sont **locales** (aucun commit, aucun push, aucune branche distante modifiée). Aucune base, aucun volume et aucune donnée utilisateur n'ont été supprimés.

---

## A. Tableau des fonctionnalités

| Module | Fonctionnalité | État | Où le vérifier |
|---|---|---|---|
| **Comptes & rôles** | Inscription avec choix **Parent** ou **Babysitter** (ADMIN refusé : 400) | ✅ opérationnel | « Créer un compte » |
| | Profil (prénom, nom) modifiable, persisté dans Keycloak | ✅ | « Mon profil » |
| | Changement de mot de passe (vérification de l'ancien) | ✅ | « Mon profil » → Sécurité |
| | Déconnexion | ✅ | menu utilisateur |
| | Compte administrateur : mot de passe `KC_APP_ADMIN_PASSWORD` (généré par `setup`, jamais dans le code), appliqué une seule fois | ✅ | `keycloak-init` |
| | PARENT n'est plus un rôle par défaut (migration sans perte de droits) | ✅ | jeton du babysitter |
| **Babysitting** | Demande de garde (PARENT), modification, suppression avec confirmation | ✅ | Babysitting → Mes demandes |
| | Propriétaire affiché (nom issu du jeton) | ✅ | cartes de demandes |
| | Recherche de babysitters par quartier et date | ✅ | « Trouver un babysitter » |
| | Disponibilités et acceptation réservées au BABYSITTER ; ADMIN modère | ✅ | 403 sinon |
| | Heures comptabilisées sans blocage (option `ENFORCE_MIN_CREDIT_ON_COMPLETE`) | ✅ | Mes gardes → Heures |
| **Marketplace** | CRUD annonces, photos **depuis le PC** (6 max, 5 Mo, JPEG/PNG/WebP/GIF vérifiés par signature), aperçu, retrait, photo principale | ✅ | Publier une annonce |
| | Devises **TND / EUR / USD** validées (aucune conversion inventée) | ✅ | « 85 DT » |
| | Nom réel du vendeur (plus de noms codés en dur) | ✅ | détail annonce |
| | Recherche à proximité (`lat`, `lng`, `radiusKm`) | ✅ | Mon quartier |
| **Géolocalisation** | Carte **Leaflet / OpenStreetMap**, marqueurs (événements, annonces, points de rencontre), quartiers | ✅ | Mon quartier |
| | Position avec **consentement**, floutée ~200 m par le serveur, retrait possible | ✅ | « Utiliser ma position » / « Retirer » |
| | Recherche de ville (OpenStreetMap Nominatim), rayon **5 / 10 / 20 km**, « Trouver les services à proximité » | ✅ | Mon quartier |
| | CRUD ADMIN des points de rencontre (clic sur la carte) et des quartiers | ✅ | onglet Points de rencontre |
| | Données simulées supprimées (le service renvoie de vraies erreurs) | ✅ | `geo.service.ts` |
| **Messagerie** | Conversations, envoi, **images depuis le PC** (participants uniquement), modification et suppression de ses messages | ✅ | Messages |
| **Communauté** | Publications avec **photos**, modification (page dédiée), commentaires modifiables | ✅ | Communauté |
| **Événements** | Inchangés et fonctionnels ; coordonnées géocodées pour la carte | ✅ | Événements |
| **Administration** | Tableau de bord **réel** : utilisateurs, parents, babysitters, admins, demandes de garde, annonces, événements, participations, publications, signalements, conversations, messages | ✅ | Administration |
| | Graphiques : inscriptions sur 30 jours, répartition Parents/Babysitters, activité par module, inscriptions récentes | ✅ | Administration |
| | Gestion des utilisateurs : liste, recherche, filtre par rôle, modification, suspension/réactivation, changement de rôle, suppression (garde-fous : soi-même, dernier admin) | ✅ | Administration → Utilisateurs |
| | Modération par module ; **aucun accès au contenu des conversations privées** (compteurs seulement) | ✅ | Administration → Modération |
| **Microservices** | **Spring Cloud Config Server** réel (`Backend/config-repo`), clients Event et Participation | ✅ | http://localhost:8888 |
| | **OpenFeign** réel : Participation → Event, résolu dans **Eureka** (retries, traduction d'erreurs et compensation conservées) | ✅ | inscription à un événement |
| | **Swagger centralisé** à la Gateway (Gateway + 10 services) | ✅ | http://localhost:8080/swagger-ui.html |
| **Tableau de bord parent** | Compteurs réels (plus de « 28 / 14 / 42 » ni « 4.9 ★ / 12 € » inventés), inscription et favoris réellement enregistrés | ✅ | Accueil |

---

## B. Architecture

```text
 Navigateur ── Frontend Angular (http://localhost:4200)
      │ tous les appels → API Gateway (jeton envoyé uniquement à l'API, jamais aux sites externes)
      ▼
 API Gateway :8080 (Spring Cloud Gateway)
  · JWT Keycloak vérifié · relais X-User-* · /api/admin/** = ADMIN
  · /api/auth/register, /api/auth/me (compte), /api/admin/stats, /api/admin/users (Keycloak Admin API)
  · Swagger UI centralisé : /swagger-ui.html ← /docs/<service>
      │ lb://NOM-EUREKA
      ▼
 event-service ◄── OpenFeign (Eureka + LoadBalancer) ── participation-service
 post · comment · category · report (Laravel) · babysitting (FastAPI) · marketplace (NestJS)
 messaging (Go) · geo (FastAPI, MongoDB 2dsphere)
      ▲
 Config Server :8888 (Backend/config-repo) ──► event-service, participation-service
 Eureka :8761 (12 instances) · Keycloak :8180 · RabbitMQ (parentconnect.topic)
 Volumes persistants ajoutés : marketplace_uploads, messaging_uploads, post_uploads
```

Sécurité des fichiers téléversés (3 services) : type vérifié sur le **contenu** (signature binaire / `finfo` / `DetectContentType`), taille limitée à 5 Mo, nom aléatoire généré par le serveur (le nom d'origine n'est jamais réutilisé), lecture refusée pour tout nom non conforme (aucune traversée de chemin), `X-Content-Type-Options: nosniff`. Les images de messagerie ne sont servies qu'aux participants de la conversation.

---

## C. Fichiers modifiés ou ajoutés (cette phase)

**Keycloak / Docker / scripts**
- `Backend/keycloak/init-registration-client.sh` — rôle BABYSITTER, compte `babysitter_test`, migration PARENT, mot de passe admin initialisé une seule fois.
- `docker-compose.yml` — service `config-server`, volumes d'images, `MAX_SEARCH_RADIUS_M=20000`, Participation résout Event par Eureka.
- `.env.example` (`KC_APP_ADMIN_PASSWORD`, `CONFIG_SERVER_PORT`), `scripts/smoke-test.sh`, `scripts/smoke-test.ps1` (envoi multipart compatible Windows PowerShell 5.1).

**API Gateway** — `admin/AdminController.java` (nouveau), `registration/*` (rôle à l'inscription, compte), `config/SecurityConfig.java`, `application.yml` (routes `/docs/*`, Swagger, participation admin), `pom.xml` (springdoc WebFlux).

**Config Server (nouveau)** — `Backend/config-server/**` (pom, application, Dockerfile, test) et `Backend/config-repo/*.yml`.

**Event** — `pom.xml` (client Config), `application.yml`, test d'intégration (Config désactivé en test).

**Participation** — `client/EventServiceApi.java` (Feign), `client/EventServiceFeignConfig.java`, `client/EventServiceClient.java`, `client/EventServiceProperties.java` ; suppression de `EventServiceClientConfig.java` et `AuthorizationPropagationInterceptor.java` (remplacés par la configuration Feign) ; `controller/AdminStatsController.java`, `repository/ParticipationRepository.java`, `security/SecurityConfig.java`, `application.yml`, `pom.xml`, tests.

**Babysitting** — `security/dependencies.py` (rôles Keycloak, nom affiché, `require_roles`), modèles, schémas, dépôts, `routers/requests.py`, `routers/availability.py`, `routers/admin.py` (nouveau), `core/config.py`, `alembic/versions/0002_display_names.py`, tests (`test_roles_and_crud_api.py` + correction de tests existants défectueux).

**Marketplace** — `uploads/*` (nouveau), `listings/admin-stats.controller.ts`, DTO (devise, images, coordonnées, rayon), schéma (`ownerName`), service, décorateur utilisateur, tests.

**Messagerie** — `internal/attachments/store.go`, `internal/handlers/message_actions.go` (nouveaux), modèles, service, configuration, `cmd/server/main.go`, `Dockerfile`, test unitaire.

**Communauté** — post-service : `PostImageController.php`, migration `images`, requêtes, ressource, service, routes ; correction de la règle `exists:categories` (table d'un autre service, 500 à chaque modification). comment-service : méthode `update` manquante (la route renvoyait 500).

**Géolocalisation** — `routers/admin_crud.py` (nouveau), `routers/meeting_points.py`, service et modèle, tests.

**Frontend** — `features/admin/*` (nouveau), `core/guards/admin.guard.ts`, `core/services/geocoding.service.ts` (nouveau), `core/services/geo.service.ts` (réécrit sans données simulées), `core/interceptors/auth.interceptor.ts` (jeton limité à l'API), `features/neighborhood/*` (carte), `features/babysitting/*`, `features/marketplace/*`, `features/messaging/*`, `features/community/*`, `features/dashboard/*`, `features/events/services/events.service.ts`, `layout/sidebar`, `app.routes.ts`, `angular.json`, `package.json` et `package-lock.json` (ajout de `leaflet` et `@types/leaflet` uniquement).

**Documentation** — `DEMARRAGE.md`, `Documentation/INTEGRATION.md`, ce rapport.

---

## D. Tests (résultats réels, exécutés sur la plateforme démarrée)

| Suite | Résultat |
|---|---|
| Smoke test Bash (`scripts/smoke-test.sh`) — tous les services via la Gateway | **191 / 191** |
| Smoke test PowerShell (`scripts/smoke-test.ps1`) | **189 / 189** |
| Navigateur — nouvelles fonctionnalités (rôles, Babysitting, Marketplace, Communauté, Messagerie, carte, Administration, tableau de bord) | **36 / 36** |
| Navigateur — Événements, modules, Marketplace, inscription (suites existantes, adaptées aux nouveaux rôles) | toutes OK |
| Event Service (JUnit + Testcontainers) | **48 / 48** |
| Participation Service (dont client OpenFeign + WireMock) | **42 / 42** |
| Config Server | **2 / 2** |
| API Gateway | **5 / 5** |
| Babysitting (pytest) | **113 / 113** (dont 5 tests existants défectueux corrigés) |
| Géolocalisation (pytest + MongoDB) | **40 / 40** |
| Marketplace (Jest) | **22 / 22** |
| Messagerie (Go) | **22 / 22** |
| Frontend | compilation de production sans erreur |

Non couvert dans cet environnement : les tests PHPUnit des services Laravel (vérification par `php -l` et par les scénarios API des smoke tests) ; l'affichage des tuiles OpenStreetMap et la recherche Nominatim (pas d'accès Internet depuis le bac à sable : elles fonctionnent sur un PC connecté).

---

## E. Commandes de démarrage (Windows / PowerShell, à la racine du projet)

```powershell
.\scripts\setup.ps1
```

```powershell
docker compose up -d --build
```

```powershell
docker compose ps
```

```powershell
.\scripts\smoke-test.ps1
```

Mot de passe administrateur :

```powershell
(Get-Content .env | Select-String '^KC_APP_ADMIN_PASSWORD=').ToString().Split('=',2)[1]
```

Ne jamais utiliser `docker compose down -v`.

---

## F. Scénario de démonstration (5 à 10 minutes)

1. **Inscription Babysitter** (navigation privée) : « Créer un compte » → Babysitter → l'onglet « Demandes à pourvoir » apparaît, pas de « Demander une garde ».
2. **Marie (parent)** : Babysitting → « Demander une garde », puis Modifier et Supprimer une demande (confirmation).
3. **Nadia (babysitter)** : « Je peux garder » sur une demande de Marie ; Marie confirme puis « Marquer terminée ».
4. **Marketplace** : Marie publie une annonce avec une photo de son PC, prix 85 TND → « 85 DT ».
5. **Communauté** : publication avec photo, modification, commentaire modifié.
6. **Messages** : envoi d'une image, modification puis suppression d'un message.
7. **Mon quartier** : « Utiliser ma position » (consentement), rayon 20 km, « Trouver les services à proximité ».
8. **Admin** : Événements → créer ; Marie s'inscrit (Participation → Event par OpenFeign/Eureka).
9. **Admin** → Administration : statistiques et graphiques réels, puis Utilisateurs : rechercher, changer un rôle, suspendre/réactiver.
10. **Architecture** : http://localhost:8761 (Eureka), http://localhost:8888/parentconnect-participation-service/default (Config Server), http://localhost:8080/swagger-ui.html (Swagger centralisé).

---

## Points d'attention

- Une demande de garde est limitée à 10 par heure et par parent (règle existante du service).
- « Ma famille » et les compléments de profil (ville, code postal) restent stockés dans le navigateur, faute de service Identité & Famille.
- La validation par les voisins d'une demande de vérification d'adresse n'est plus proposée dans l'interface : l'ancienne liste était fictive et le service ne fournit pas de liste des demandes en attente (la demande de vérification, elle, est réelle).
- Le Config Server sert Event et Participation ; la Gateway reste configurée par son propre fichier.
