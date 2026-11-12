# ParentConnect — Messagerie Asynchrone avec RabbitMQ

Ce guide détaille la mise en œuvre de la communication asynchrone par échange de messages via **RabbitMQ** au sein de l'écosystème de microservices **ParentConnect**.

---

## 1. Pourquoi RabbitMQ dans notre architecture Microservices ?

Dans une architecture distribuée, certaines actions ne doivent pas bloquer la requête utilisateur :
- Lorsqu'un parent **publie une nouvelle annonce** de don ou de prêt, d'autres microservices doivent réagir (ex: envoyer une notification aux parents du même quartier, indexer l'article dans le moteur de recherche, mettre à jour les statistiques).
- Le microservice **Marketplace** produit un événement et le publie dans RabbitMQ sans attendre que les consommateurs aient terminé : c'est le **découplage temporel et spatial**.

```
[ Marketplace Microservice ]
            │
            ▼ (publishEvent)
 ┌──────────────────────────────────────────────┐
 │     RABBITMQ BROKER (Port 5672)              │
 │  Exchange: parentconnect.marketplace.exchange│
 └──────────────┬───────────────────────────────┘
                │
                ├─────────────────────────────┐
                │ Routing Key:                │ Routing Key:
                │ marketplace.listing.created │ marketplace.listing.borrowed
                ▼                             ▼
   [ Queue: notification.queue ]   [ Queue: audit.queue ]
                │                             │
                ▼                             ▼
    [ Notification Service ]       [ Analytics Service ]
```

---

## 2. Configuration & Éléments RabbitMQ

| Propriété | Valeur | Rôle |
| :--- | :--- | :--- |
| **Port AMQP** | `5672` | Protocole binaire de transport des messages |
| **Port Console Web** | `15672` | Interface web d'administration RabbitMQ (`http://localhost:15672`) |
| **Identifiants** | `guest` / `guest` | Utilisateur par défaut |
| **Exchange** | `parentconnect.marketplace.exchange` | Type `topic` pour un routage flexible |
| **Files d'attente (Queues)** | `parentconnect.marketplace.queue`<br>`notification.marketplace.queue` | Stockage persistant des messages |

---

## 3. Événements Publiés par le Microservice Marketplace

| Événement | Routing Key | Déclencheur | Données transportées (Payload) |
| :--- | :--- | :--- | :--- |
| `listing.created` | `marketplace.listing.created` | `POST /api/listings` | `id`, `title`, `category`, `price`, `type`, `ownerId`, `location` |
| `listing.borrowed` | `marketplace.listing.borrowed` | `POST /api/listings/:id/borrow` | `listingId`, `title`, `borrowerId`, `ownerId`, `startDate`, `returnDate` |
| `listing.returned` | `marketplace.listing.returned` | `POST /api/listings/:id/return` | `listingId`, `title`, `ownerId`, `borrowerId`, `returnedAt` |
| `listing.updated` | `marketplace.listing.updated` | `PUT /api/listings/:id` | `id`, `title`, `price`, `status`, `updatedBy` |
| `listing.deleted` | `marketplace.listing.deleted` | `DELETE /api/listings/:id` | `id`, `ownerId`, `deletedBy`, `deletedAt` |

---

## 4. Démarrage de RabbitMQ

### Via Docker Compose :
```bash
cd Backend
docker-compose up -d rabbitmq
```
- Accès à la console web RabbitMQ : **`http://localhost:15672`** (login: `guest`, pass: `guest`).
- Vous pouvez visualiser les échanges, les files d'attente et le débit de messages par seconde en direct.

---

## 5. Inspection en direct du flux d'événements (Pour la soutenance)

Le microservice Marketplace expose un endpoint dédié pour vérifier et montrer en temps réel à l'enseignant les événements publiés dans RabbitMQ :

👉 **`http://localhost:3002/api/listings/events/rabbitmq`**  
*(Ou via l'API Gateway : **`http://localhost:8080/api/listings/events/rabbitmq`**)*

**Exemple de retour JSON :**
```json
{
  "brokerConnected": true,
  "brokerUri": "amqp://localhost:5672",
  "exchange": "parentconnect.marketplace.exchange",
  "queue": "parentconnect.marketplace.queue",
  "totalPublished": 3,
  "events": [
    {
      "eventId": "evt_1731234567890_x8k2p",
      "eventType": "listing.borrowed",
      "routingKey": "marketplace.listing.borrowed",
      "timestamp": "2026-11-10T09:55:00.000Z",
      "producer": "marketplace-service",
      "data": {
        "listingId": "6ad2a8af0de6acd4d68e5584",
        "title": "Tire-lait électrique Medela Swing",
        "borrowerId": "user_2",
        "ownerId": "user_1"
      }
    }
  ]
}
```
