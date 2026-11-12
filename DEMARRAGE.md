# ParentConnect — Démarrage rapide (démonstration)

Prérequis : **Docker Desktop** démarré. Dans PowerShell, à la racine du projet :

```powershell
.\scripts\setup.ps1
```

```powershell
docker compose up -d --build
```

```powershell
.\scripts\smoke-test.ps1
```

| Ouvrir | Adresse |
|---|---|
| Application (frontend) | http://localhost:4200 |
| API Gateway (point d'entrée unique) | http://localhost:8080 |
| **Swagger centralisé** (Gateway + tous les services) | http://localhost:8080/swagger-ui.html |
| Eureka — services enregistrés | http://localhost:8761 |
| Config Server (configuration centralisée) | http://localhost:8888/parentconnect-participation-service/default |
| Keycloak (realm `parentconnect`) | http://localhost:8180 |
| RabbitMQ | http://localhost:15672 |

Après une mise à jour du projet (nouveau service ajouté), relancer `.\scripts\setup.ps1` : il complète le `.env` existant sans modifier les valeurs déjà présentes. Ne jamais utiliser `docker compose down -v` (cela supprimerait les données).

## Comptes et rôles

Connexion au frontend avec l'**e-mail** :

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Administrateur | admin@parentconnect.local | `KC_APP_ADMIN_PASSWORD` du `.env` (généré par `setup`, jamais écrit dans le code) |
| Parent | marie.l@email.com, paul.d@email.com | `KC_DEMO_PASSWORD` du `.env` (par défaut `ParentConnect2026!`) |
| Babysitter | nadia.k@email.com | `KC_DEMO_PASSWORD` |
| Professionnel | sophie.b@email.com | `KC_DEMO_PASSWORD` |

Afficher le mot de passe administrateur :

```powershell
(Get-Content .env | Select-String '^KC_APP_ADMIN_PASSWORD=').ToString().Split('=',2)[1]
```

Le mot de passe administrateur est appliqué une seule fois au premier démarrage ; s'il est ensuite changé depuis « Mon profil », il n'est plus écrasé.

**Créer un compte** : « Créer un compte » propose **Parent** ou **Babysitter** (le rôle Administrateur ne peut pas être choisi à l'inscription). Le profil (nom, prénom) et le mot de passe se modifient dans « Mon profil ».

| Action | Parent | Babysitter | Admin |
|---|---|---|---|
| Publier / modifier / supprimer ses demandes de garde, rechercher un babysitter | ✅ | ❌ | ✅ (toutes) |
| Publier ses disponibilités, accepter une demande (« Je peux garder ») | ❌ | ✅ | ✅ |
| S'inscrire aux événements | ✅ | ❌ | ❌ |
| Créer / modifier / annuler un événement | ❌ | ❌ | ✅ |
| Annonces, Communauté, Messagerie (ses propres contenus) | ✅ | ✅ | ✅ (modération) |
| Tableau de bord administrateur, gestion des comptes | ❌ | ❌ | ✅ |

Documentation complète : [Documentation/INTEGRATION.md](Documentation/INTEGRATION.md) et rapport : [Documentation/RAPPORT_FINAL.md](Documentation/RAPPORT_FINAL.md).

## Scénario de démonstration (5 à 10 minutes, 2 navigateurs : un normal, un en navigation privée)

| # | Qui | Où | Action | Ce qu'on montre |
|---|---|---|---|---|
| 1 | Nouveau visiteur | Créer un compte | Choisir **Babysitter**, s'inscrire | Rôle choisi à l'inscription (Keycloak via la Gateway) |
| 2 | Marie (parent) | Babysitting | « Demander une garde », puis **Modifier** et **Supprimer** une demande | CRUD et permissions par rôle |
| 3 | Marie | Babysitting → « Trouver un babysitter » | Rechercher par quartier / date, « Contacter » | Recherche de disponibilités, messagerie |
| 4 | Nadia (babysitter) | Babysitting | « Je peux garder » sur la demande de Marie | Acceptation réservée au babysitter |
| 5 | Marie | Marketplace | Publier une annonce **avec une photo depuis le PC**, prix en **TND** | Téléversement sécurisé, devises TND/EUR/USD |
| 6 | Marie | Communauté | Publication avec photo, modification, commentaire modifié | Photos, édition persistante |
| 7 | Marie / Nadia | Messages | Envoyer une **image**, modifier puis supprimer un message | Images réservées aux participants |
| 8 | Sophie | Mon quartier | « Utiliser ma position » (consentement), rayon **5 / 10 / 20 km**, « Trouver les services à proximité » | Carte Leaflet/OpenStreetMap, positions floutées |
| 9 | Admin | Événements | Créer un événement ; Marie s'y inscrit | Participation → Event Service par **OpenFeign** (Eureka) |
| 10 | Admin | Administration | Statistiques réelles, graphiques, puis onglet **Utilisateurs** : rechercher, changer un rôle, suspendre, supprimer | Tableau de bord dynamique |
| 11 | — | http://localhost:8080/swagger-ui.html | Choisir un service dans la liste | Swagger centralisé |
| 12 | — | http://localhost:8761 et :8888 | Services enregistrés ; configuration servie | Eureka, Config Server |
