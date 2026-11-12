# PARENTCONNECT – INSTRUCTIONS FRONTEND : ÉVÉNEMENTS ET PARTICIPATIONS

> Complément du prompt « Instructions d'intégration du Frontend » pour les fonctionnalités **Événements** (Event Service) et **Participations** (Participation Service). À transmettre au responsable du Frontend.

Tu es Senior Frontend Engineer sur le projet ParentConnect. Intègre les écrans Événements et Participations en respectant les règles générales du projet :

- **Toutes** les requêtes passent par l'API Gateway : `http://localhost:8080` (variable `VITE_API_BASE_URL`, `REACT_APP_API_BASE_URL` ou `environment.ts`). Ne jamais appeler les services directement (ni 8085 / 8086, qui ne servent qu'aux tests locaux, ni le port interne 8080 des conteneurs).
- L'intercepteur HTTP ajoute `Authorization: Bearer <access_token>` (token Keycloak) sur chaque requête.
- `401` → redirection vers la connexion ; `403` → message « accès refusé » sans déconnexion.

## 1. Routes à appeler

**Toutes ces routes exigent un utilisateur connecté** (aucune n'est publique, contrairement à la liste des posts).

| Fonctionnalité | Méthode et URL (via la Gateway) | Rôle requis |
|---|---|---|
| Lister / rechercher les événements | `GET http://localhost:8080/api/events` | `PARENT`, `PROFESSIONAL`, `ADMIN` |
| Détail d'un événement | `GET http://localhost:8080/api/events/{id}` | `PARENT`, `PROFESSIONAL`, `ADMIN` |
| Créer un événement | `POST http://localhost:8080/api/events` | `PARENT`, `PROFESSIONAL`, `ADMIN` |
| Modifier un événement | `PUT http://localhost:8080/api/events/{id}` | Organisateur de l'événement ou `ADMIN` |
| Annuler un événement | `DELETE http://localhost:8080/api/events/{id}` | Organisateur de l'événement ou `ADMIN` |
| Mes événements créés | `GET http://localhost:8080/api/events/me/organized` | `PARENT`, `PROFESSIONAL`, `ADMIN` |
| S'inscrire | `POST http://localhost:8080/api/events/{id}/join` | `PARENT`, `ADMIN` |
| Se désinscrire | `DELETE http://localhost:8080/api/events/{id}/leave` | `PARENT`, `ADMIN` |
| Participants d'un événement | `GET http://localhost:8080/api/events/{id}/participants` | Organisateur de l'événement ou `ADMIN` |
| Mes participations | `GET http://localhost:8080/api/events/me/joined` | `PARENT`, `ADMIN` |

Règles d'affichage à en déduire :

- masquer « S'inscrire » pour un `PROFESSIONAL`, pour l'organisateur de l'événement (`organizerId` = `sub` du token) et pour un événement complet (`full: true`), annulé ou passé ;
- afficher « Modifier », « Annuler » et « Participants » uniquement à l'organisateur (`organizerId` = `sub` du token) ou à un `ADMIN`.

Le serveur applique de toute façon ces règles : l'interface doit simplement éviter de proposer des actions refusées.

## 2. Recherche (`GET /api/events`)

Tous les paramètres sont facultatifs et combinables :

| Paramètre | Exemple | Effet |
|---|---|---|
| `city` | `Lyon` | Ville (casse ignorée) |
| `category` | `SORTIE` | `SORTIE`, `ATELIER`, `SPORT`, `JEUX`, `RENCONTRE_PARENTS`, `AUTRE` |
| `dateFrom`, `dateTo` | `2026-12-01` | Date de début comprise dans l'intervalle (format `yyyy-MM-dd`) |
| `childAge` | `5` | Événements adaptés à cet âge |
| `lat`, `lng`, `radiusKm` | `45.76`, `4.83`, `5` | Autour d'une position (rayon par défaut 10 km) |
| `onlyAvailable` | `true` | Uniquement à venir avec des places libres |
| `page`, `size`, `sort` | `0`, `20`, `startDateTime,asc` | Pagination (taille max. 100) et tri (`startDateTime`, `endDateTime`, `createdAt`, `title`, `city`, `capacity`, `category`) |

Réponse paginée :

```json
{
  "content": [ { "id": "…", "title": "Atelier peinture", "availablePlaces": 6, "full": false, "status": "PUBLISHED", "…": "…" } ],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1, "first": true, "last": true
}
```

## 3. Créer / modifier un événement

Corps JSON (`POST /api/events` et `PUT /api/events/{id}` ; le `PUT` remplace **tous** les champs) :

```json
{
  "title": "Atelier peinture",
  "description": "Pour les 4-8 ans",
  "category": "ATELIER",
  "startDateTime": "2026-12-05T14:00:00",
  "endDateTime": "2026-12-05T16:00:00",
  "locationName": "Maison des associations",
  "address": "12 rue Garibaldi",
  "city": "Lyon",
  "latitude": 45.76,
  "longitude": 4.85,
  "capacity": 10,
  "minChildAge": 4,
  "maxChildAge": 8
}
```

- Obligatoires : `title`, `category`, `startDateTime` (dans le futur), `endDateTime` (après le début), `city`, `capacity` (> 0).
- `latitude` et `longitude` vont ensemble ; `minChildAge` ≤ `maxChildAge`.
- Ne jamais envoyer d'`organizerId` : l'organisateur est l'utilisateur du token.
- Dates au format ISO local `yyyy-MM-ddTHH:mm:ss` (heure de Paris).

Réponse `201` : l'événement créé (avec son `id`, `reservedPlaces`, `availablePlaces`, `full`, `status`, `organizerId`).

## 4. Inscriptions

- `POST /api/events/{id}/join` (sans corps) → `201` avec la participation (`status: "CONFIRMED"`).
- `DELETE /api/events/{id}/leave` → `204`. Une réinscription ultérieure est possible s'il reste des places.
- Après une inscription ou une désinscription, recharger l'événement pour mettre à jour `availablePlaces`.

## 5. Erreurs à gérer

Toutes les erreurs ont ce format :

```json
{ "timestamp": "2026-11-11T15:00:00", "status": 409, "error": "Conflict", "message": "L'événement est complet", "path": "/api/events/…/join" }
```

| Code | Comportement de l'interface |
|---|---|
| `400` | Afficher `message` près du formulaire (champs invalides, dates incohérentes…) |
| `401` | Rediriger vers la connexion |
| `403` | « Accès refusé » (rôle insuffisant, ni organisateur ni ADMIN) |
| `404` | « Événement introuvable » ou « Aucune inscription active » |
| `409` | Afficher `message` tel quel, déjà en français : « Vous êtes déjà inscrit à cet événement », « L'événement est complet », « L'événement a été annulé », « L'événement a déjà commencé ou est terminé », « Un organisateur ne peut pas s'inscrire à son propre événement »… |
| `503` | « Service momentanément indisponible, réessayez » (proposer un bouton Réessayer) |

## 6. Valeurs utiles

| Champ | Valeurs |
|---|---|
| `status` d'un événement | `PUBLISHED`, `CANCELLED`, `COMPLETED` |
| `status` d'une participation | `CONFIRMED`, `CANCELLED` |
| Identifiants | UUID (l'identifiant de l'utilisateur est le `sub` de son token Keycloak) |
