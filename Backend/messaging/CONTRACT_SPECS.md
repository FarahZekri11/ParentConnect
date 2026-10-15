# 🤝 ParentConnect - Contrats d'Interface & Intégration Inter-Services
**Microservice :** `Messaging`  
**Responsable :** Équipe Messaging (Go / Gin / WebSocket / MongoDB / Redis)  
**Version :** `1.0.0`

Ce document définit les spécifications et contrats techniques d'intégration entre le microservice **Messaging** et les 5 autres services de la plateforme ParentConnect.

---

## 1. 🛡️ Contrat avec l'équipe API Gateway (Nginx)

### A. Routage HTTP / REST
Toutes les requêtes suivantes doivent être relayées vers l'amont `messaging-service:8085` :

| Préfixe de Route Gateway | Méthodes | Service de Destination | Remarques |
| :--- | :--- | :--- | :--- |
| `/api/conversations/**` | GET, POST, PATCH | `messaging-service:8085` | Gestion des discussions |
| `/api/messages/**` | POST | `messaging-service:8085` | Envoi de messages |
| `/api/notifications/**` | GET, PATCH | `messaging-service:8085` | Alertes et notifications |
| `/health` & `/ready` | GET | `messaging-service:8085` | Sondes de supervision K8s / Docker |
| `/swagger/**` | GET | `messaging-service:8085` | Documentation Swagger intégrée |

> ⚠️ **Sécurité Gateway** : La route `/internal/**` ne **DOIT PAS** être exposée publiquement par Nginx. Elle est réservée aux échanges directs réseau interne conteneur-à-conteneur avec validation de l'en-tête `X-Internal-Key`.

### B. Proxying WebSocket Temps Réel
La route `/ws` nécessite une configuration Nginx spécifique avec les en-têtes d'upgrade HTTP/1.1 :
```nginx
location /ws {
    proxy_pass http://messaging_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

---

## 2. 🔐 Contrat avec l'équipe Identity & Family (Java / Spring Boot)

Messaging valide les requêtes utilisateurs **localement** sans solliciter le service Identity à chaque appel.

- **En-tête HTTP attendu** : `Authorization: Bearer <JWT>`
- **Algorithme supporté** : **RS256** (asymétrique via clé publique) ou **HS256** (secret partagé).
- **Structure des Claims requise** :
```json
{
  "sub": "user-uuid-1234",       // OBLIGATOIRE : Identifiant unique du parent
  "role": "PARENT",              // Rôle utilisateur (PARENT, ADMIN, etc.)
  "exp": 1792080000,             // Timestamp UNIX d'expiration
  "iat": 1792076400              // Timestamp UNIX d'émission
}
```
> *Règle d'or microservice :* Messaging ne stocke aucun profil utilisateur, prénom ou nom d'enfant. Il ne manipule que le `sub` (`user_id`).

---

## 3. 🐰 Contrat Bus d'Événements Asynchrone (RabbitMQ)

### A. Enveloppe commune obligatoire
Tous les services publiant sur RabbitMQ doivent respecter le topic exchange **`parentconnect.events`** et encapsuler leur message dans le format standard suivant :

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "NomDeLEvenement",
  "version": "1.0",
  "occurred_at": "2026-10-15T18:30:00Z",
  "data": { ... }
}
```
*Note sur l'idempotence :* Le service Messaging garantit qu'un `event_id` déjà traité ne sera jamais rejoué.

---

### B. Événement `BookingAccepted` (Service Babysitting ➡️ Messaging)
- **Routing Key :** `babysitting.booking.accepted`
- **Contenu du champ `data` :**
```json
{
  "booking_id": "booking-uuid-789",
  "requester_id": "user-parent-demandeur",
  "babysitter_id": "user-parent-gardien",
  "booking_date": "2026-10-20T19:00:00Z"
}
```
- **Action déclenchée par Messaging :**
  1. Ouvre automatiquement une conversation de contexte `BABYSITTING` entre les deux parents.
  2. Notifie le demandeur que sa garde a été acceptée.
  3. Pousse la notification en direct sur le WebSocket si le parent est en ligne.

---

### C. Événement `NewNeighborJoined` (Module Geo ➡️ Messaging)
- **Routing Key :** `geo.neighbor.joined`
- **Contenu du champ `data` :**
```json
{
  "new_user_id": "user-nouveau-voisin",
  "neighborhood_name": "Quartier des Cerisiers",
  "neighbor_ids": [
    "user-voisin-1",
    "user-voisin-2",
    "user-voisin-3"
  ]
}
```
- **Action déclenchée par Messaging :**
  1. Crée une notification pour chaque parent listé dans `neighbor_ids`.
  2. Envoie une alerte temps réel sur leurs WebSockets respectifs.

---

### D. Événement `MarketplaceItemRequested` (Service Marketplace ➡️ Messaging)
- **Routing Key :** `marketplace.item.requested`
- **Contenu du champ `data` :**
```json
{
  "request_id": "req-uuid-111",
  "item_id": "item-uuid-222",
  "item_title": "Siège auto Isofix",
  "owner_id": "user-proprietaire",
  "requester_id": "user-emprunteur"
}
```
- **Action déclenchée par Messaging :** Notifie le propriétaire de l'objet d'une nouvelle demande d'emprunt.

---

## 4. 💻 Guide pour l'équipe Frontend (Angular)

### A. Connexion WebSocket
```typescript
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MessagingSocketService {
  private socket: WebSocket;

  connect(token: string) {
    // Connexion avec token JWT en query param
    this.socket = new WebSocket(`ws://localhost/ws?token=${token}`);

    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'NEW_MESSAGE':
          console.log('Nouveau message reçu :', message.payload);
          break;
        case 'NOTIFICATION':
          console.log('Nouvelle notification reçue :', message.payload);
          break;
        case 'USER_TYPING':
          console.log('Le participant écrit :', message.payload);
          break;
      }
    };
  }

  sendMessage(conversationId: string, content: string) {
    this.socket.send(JSON.stringify({
      type: 'SEND_MESSAGE',
      conversation_id: conversationId,
      payload: { content }
    }));
  }
}
```

### B. Format des réponses d'erreur API
Toutes les erreurs REST respectent l'enveloppe standardisée :
```json
{
  "success": false,
  "error": "Message explicatif de l'erreur"
}
```
Codes HTTP significatifs :
- `400 Bad Request` : Paramètres invalides ou message vide / trop long.
- `401 Unauthorized` : Token manquant, signature invalide ou expiré.
- `403 Forbidden` : Tentative d'accès à une discussion dont l'utilisateur n'est pas participant.
- `429 Too Many Requests` : Rate limit dépassé (en-tête `Retry-After` fourni).
- `503 Service Unavailable` : Dépendance temporairement indisponible (en reconnexion).
