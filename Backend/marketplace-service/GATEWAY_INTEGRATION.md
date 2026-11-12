# ParentConnect — Marketplace Microservice
## API Gateway Integration Specification

This document provides all technical contracts, network configurations, headers, and endpoints for the teammate responsible for the **ParentConnect API Gateway**.

---

## 1. Service Overview & Network Configuration

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Service Name** | `marketplace-service` | |
| **Technology** | NestJS 10, TypeScript, Mongoose | |
| **Internal Port** | `3002` | Configurable via `PORT` env var |
| **Base URL** | `http://localhost:3002/api` | |
| **Docker Container Name** | `parentconnect_marketplace_service` | On network `parentconnect-network` |
| **Docker Service URL** | `http://marketplace-service:3002/api` | For Docker-to-Docker routing |
| **Database** | MongoDB (`parentconnect_marketplace`) | Strict database-per-service pattern |
| **Swagger UI** | `http://localhost:3002/api/docs` | OpenAPI 3.0 specification |

---

## 2. API Gateway Routing Rules

The API Gateway should route incoming requests matching `/api/listings` or `/api/marketplace` directly to this service:

| Gateway Ingress Route | Target Microservice Destination | Methods | Auth Policy |
| :--- | :--- | :--- | :--- |
| `/api/listings` | `http://marketplace-service:3002/api/listings` | `GET` | **Public** (No token required) |
| `/api/listings` | `http://marketplace-service:3002/api/listings` | `POST` | **Protected** (Forward user headers) |
| `/api/listings/:id` | `http://marketplace-service:3002/api/listings/:id` | `GET` | **Public** |
| `/api/listings/:id` | `http://marketplace-service:3002/api/listings/:id` | `PUT` | **Protected** (Owner/Admin) |
| `/api/listings/:id` | `http://marketplace-service:3002/api/listings/:id` | `DELETE` | **Protected** (Owner/Admin) |
| `/api/listings/:id/borrow` | `http://marketplace-service:3002/api/listings/:id/borrow` | `POST` | **Protected** |
| `/api/listings/:id/return` | `http://marketplace-service:3002/api/listings/:id/return` | `POST` | **Protected** |

---

## 3. Authentication & Header Propagation Contract

The Marketplace service implements a **dual-authentication mechanism** in `JwtAuthGuard`:

### Option A: Gateway Header Forwarding (Recommended for Production Gateway)
When the API Gateway validates the user's JWT at the entrance, it must forward the following downstream HTTP headers to `marketplace-service`:

```http
x-user-id: <user_id_or_sub>
x-user-email: <user_email>
x-user-roles: USER,ADMIN
```

- When `x-user-id` is present, the Marketplace service automatically trusts the Gateway and attaches the user context to `@CurrentUser()`.
- No secondary database lookup is needed, guaranteeing low latency and high service isolation.

### Option B: Direct Bearer Token (Development & Direct Client Access)
```http
Authorization: Bearer <jwt_token>
```
Signed with the shared secret `JWT_SECRET` (`parentconnect_jwt_secret_key`).

---

## 4. Endpoints Specification

### 4.1. `GET /api/listings` — Search & Filter Listings
- **Access**: Public
- **Query Parameters**:
  - `search` *(string, optional)*: Keyword search in title, description, and tags.
  - `category` *(string, optional)*: `PUERICULTURE`, `STROLLERS`, `CLOTHING`, `TOYS`, `FEEDING`, `FURNITURE`, `SAFETY`, `MATERNITY`, `OTHER`.
  - `type` *(string, optional)*: `DONATION`, `SALE`, `LENDING`, `EXCHANGE`.
  - `condition` *(string, optional)*: `NEW`, `LIKE_NEW`, `GOOD`, `FAIR`.
  - `status` *(string, optional, default: `AVAILABLE`)*: `AVAILABLE`, `RESERVED`, `BORROWED`, `COMPLETED`, `CANCELLED`.
  - `minPrice` / `maxPrice` *(number, optional)*: Price range in EUR.
  - `city` *(string, optional)*: Filter by city (case-insensitive regex).
  - `postalCode` *(string, optional)*: Exact postal code match.
  - `ownerId` *(string, optional)*: Filter by owner user ID.
  - `page` *(number, optional, default: 1)*
  - `limit` *(number, optional, default: 20)*
  - `sortBy` *(string, optional, default: `createdAt`)*: Field name to sort on.
  - `sortOrder` *(string, optional, default: `desc`)*: `asc` or `desc`.

- **Success Response (200 OK)**:
```json
{
  "listings": [
    {
      "_id": "6ad2a8af0de6acd4d68e557c",
      "title": "Lot de vêtements bébé 6-12 mois",
      "description": "Lot de 20 pièces en très bon état...",
      "category": "CLOTHING",
      "condition": "GOOD",
      "type": "DONATION",
      "status": "AVAILABLE",
      "price": 0,
      "currency": "EUR",
      "targetAgeRange": "6 - 12 mois",
      "images": ["https://images.unsplash.com/..."],
      "tags": ["vêtements", "bébé", "don"],
      "location": {
        "city": "Paris",
        "postalCode": "75012",
        "neighborhood": "Nation"
      },
      "ownerId": "user_2",
      "isDeleted": false,
      "createdAt": "2026-10-16T22:43:59.466Z",
      "updatedAt": "2026-10-16T22:43:59.466Z"
    }
  ],
  "total": 9,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### 4.2. `GET /api/listings/:id` — Get Single Listing Details
- **Access**: Public
- **Path Parameter**: `id` (24-character hexadecimal MongoDB ObjectId).
- **Success Response (200 OK)**: Listing object.
- **Errors**: `400 Bad Request` (invalid ObjectId format), `404 Not Found`.

---

### 4.3. `POST /api/listings` — Create a New Listing
- **Access**: Protected (`x-user-id` or `Bearer JWT` required)
- **Request Body**:
```json
{
  "title": "Poussette Cybex Eezy S Twist",
  "description": "Poussette ultra-compacte, pivotante, idéale pour la ville.",
  "category": "STROLLERS",
  "condition": "LIKE_NEW",
  "type": "LENDING",
  "price": 0,
  "currency": "EUR",
  "targetAgeRange": "0 - 4 ans",
  "images": ["https://images.unsplash.com/..."],
  "tags": ["poussette", "cybex", "voyage"],
  "location": {
    "city": "Paris",
    "postalCode": "75011",
    "neighborhood": "Oberkampf"
  }
}
```
- **Business Rules Enforced**:
  - `type: DONATION` forces `price = 0`.
  - `type: SALE` requires `price > 0`.
- **Success Response (201 Created)**: Created listing document with generated `_id`.

---

### 4.4. `PUT /api/listings/:id` — Update Listing
- **Access**: Protected (Only the listing owner or user with role `ADMIN`)
- **Success Response (200 OK)**: Updated listing document.
- **Errors**: `403 Forbidden` if caller is neither owner nor admin.

---

### 4.5. `DELETE /api/listings/:id` — Soft Delete Listing
- **Access**: Protected (Owner or Admin)
- **Behavior**: Marks `isDeleted = true`. The document remains in MongoDB for auditing but will be excluded from all public searches and listings.
- **Success Response (200 OK)**:
```json
{
  "message": "Listing '<id>' was successfully deleted."
}
```

---

### 4.6. `POST /api/listings/:id/borrow` — Borrow an Item (Loan Workflow)
- **Access**: Protected (Authenticated borrower)
- **Condition**: Item must have `type: LENDING` and `status: AVAILABLE`. Owner cannot borrow their own item.
- **Request Body**:
```json
{
  "borrowerId": "user_2",
  "startDate": "2026-10-25T10:00:00.000Z",
  "returnDate": "2026-11-01T18:00:00.000Z",
  "notes": "Merci d'avance pour ce weekend !"
}
```
- **Success Response (200 OK)**: Listing with status updated to `BORROWED` and `borrowDetails` populated.

---

### 4.7. `POST /api/listings/:id/return` — Return Borrowed Item
- **Access**: Protected (Owner or Borrower)
- **Success Response (200 OK)**: Listing status reset back to `AVAILABLE`.

---

## 5. Environment Variables Reference

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3002` | HTTP listening port |
| `NODE_ENV` | `development` | `development` / `production` |
| `MONGODB_URI` | `mongodb://localhost:27017/parentconnect_marketplace` | Database connection string |
| `JWT_SECRET` | `parentconnect_jwt_secret_key` | Shared JWT verification secret |

---

## 6. Verification & Health Check

The Gateway can verify the health of the Marketplace microservice by querying:
```bash
# Query status (should return HTTP 200 with JSON)
curl -i http://localhost:3002/api/listings?limit=1

# Or check Swagger documentation
curl -i http://localhost:3002/api/docs
```
