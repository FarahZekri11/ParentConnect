# ParentConnect - Marketplace Microservice

## Overview
The **Marketplace Microservice** is a core component of the **ParentConnect** platform, developed with **TypeScript**, **NestJS**, and **MongoDB**. It empowers local parent communities to share, donate, sell, lend, and exchange baby gear and childcare equipment.

- **Developer**: Farah
- **Technology Stack**: TypeScript, NestJS, MongoDB (Mongoose), Swagger/OpenAPI, Docker
- **Default Port**: `3002`
- **Database**: MongoDB (`parentconnect_marketplace`)

---

## Features
- **Listing Management (CRUD)**: Create, view, update, and soft-delete listings.
- **Listing Types**:
  - `DONATION` (Don)
  - `SALE` (Vente)
  - `LENDING` (Prêt)
  - `EXCHANGE` (Échange)
- **Advanced Search & Filtering**:
  - Full-text / keyword search (title, description, tags)
  - Category (Strollers, Feeding, Clothing, Furniture, Toys, etc.)
  - Item Condition (New, Like New, Good, Fair)
  - Price Range (`minPrice`, `maxPrice`)
  - Location (City, Postal Code, coordinates)
  - Status (`AVAILABLE`, `RESERVED`, `BORROWED`, `COMPLETED`, `CANCELLED`)
  - Pagination (`page`, `limit`) and Sorting (`createdAt`, `price`, etc.)
- **Borrowing Workflow**:
  - `POST /api/listings/:id/borrow`: Borrow an item on loan with tracking of dates and notes.
  - `POST /api/listings/:id/return`: Return the item back to the community pool.
- **Microservices & API Gateway Alignment**:
  - Extracts caller identity from JWT Bearer tokens or API Gateway forwarded headers (`x-user-id`, `x-user-email`, `x-user-roles`).
  - Strict database isolation (Database-per-service pattern).
  - Open REST contracts compliant with ParentConnect specifications.
  - Interactive Swagger / OpenAPI documentation.

---

## API Contracts

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/listings` | Create a new listing | Yes (`JWT` or `x-user-id`) |
| `GET` | `/api/listings` | Search and filter listings | No |
| `GET` | `/api/listings/:id` | Get details of a single listing | No |
| `PUT` | `/api/listings/:id` | Update listing (owner or admin) | Yes (`JWT` or `x-user-id`) |
| `DELETE`| `/api/listings/:id` | Soft delete listing (owner or admin) | Yes (`JWT` or `x-user-id`) |
| `POST` | `/api/listings/:id/borrow` | Borrow an item marked as `LENDING` | Yes (`JWT` or `x-user-id`) |
| `POST` | `/api/listings/:id/return` | Mark borrowed item as returned | Yes (`JWT` or `x-user-id`) |

---

## Getting Started

### Prerequisites
- Node.js `v20+` (tested on Node v26)
- MongoDB instance (local or via Docker)

### Installation
```bash
cd Backend/marketplace-service
npm install
```

### Environment Configuration
Copy `.env.example` to `.env`:
```env
PORT=3002
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/parentconnect_marketplace
JWT_SECRET=parentconnect_jwt_secret_key
```

### Running Locally
```bash
# Start in development mode
npm run start:dev

# Start in production mode
npm run build
npm run start:prod
```

### Running with Docker & MongoDB
```bash
docker-compose up --build
```

---

## API Documentation
When the service is running, explore and test the endpoints via Swagger UI:
- **URL**: `http://localhost:3002/api/docs` (or `http://localhost:3002/docs`)

---

## Running Tests
```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:cov
```
