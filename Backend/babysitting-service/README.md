# ParentConnect – Babysitting Service

> Microservice #2 of **ParentConnect**, a hyperlocal parent mutual-aid platform.
> Responsible for babysitting requests, availability slots, matching, bookings, time credits, and ratings.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Quick Start (Docker)](#quick-start-docker)
3. [Local Development (without Docker)](#local-development-without-docker)
4. [Environment Variables](#environment-variables)
5. [DB Schema (ER Diagram)](#db-schema-er-diagram)
6. [API Reference](#api-reference)
7. [Event Contract](#event-contract)
8. [Running Tests](#running-tests)
9. [Project Structure](#project-structure)
10. [curl Examples](#curl-examples)

---

## Architecture Overview

```
API Gateway (:443)
       │
       ▼  /api/babysitting/**
┌─────────────────────────┐
│  babysitting-service    │  Port 8002
│  FastAPI + asyncpg      │
│  SQLAlchemy 2.0 async   │
└─────┬───────────────────┘
      │
      ├── PostgreSQL 16 (port 5433 on host)   ← own DB, never shared
      ├── Redis 7        (port 6380 on host)   ← cache + locking + events
      └── Identity service (HTTP, mock in dev)  ← JWT validation only
```

**Design decisions:**
- Database-per-service: this service owns `babysitting_db` exclusively.
- JWT is validated locally (shared secret from env). Identity service is called **only** to enrich user profiles (display name, average rating) and is abstracted behind `IdentityClientProtocol`.
- Child PII is minimised: only age-range strings (e.g. `"2-4"`) are stored — no names, photos, or DOBs.

---

## Quick Start (Docker)

```bash
# 1. Clone and enter directory
cd babysitting-service

# 2. Copy env file
cp .env.example .env
# Edit .env if needed (defaults work out of the box)

# 3. Build and start everything
docker-compose up --build

# Service is ready at:
#   http://localhost:8002/health
#   http://localhost:8002/docs   (Swagger UI)
```

The `babysitting` container automatically runs `alembic upgrade head` before starting.

---

## Local Development (without Docker)

```bash
# Prerequisites: Python 3.12, PostgreSQL 16, Redis 7

# 1. Create virtualenv
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -e ".[dev]"

# 3. Configure .env
cp .env.example .env
# Set DATABASE_URL and REDIS_URL to your local instances

# 4. Run migrations
alembic upgrade head

# 5. Start the service
uvicorn app.main:app --reload --port 8002

# 6. Swagger UI → http://localhost:8002/docs
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://babysitting:babysitting_pass@localhost:5432/babysitting_db` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `JWT_SECRET` | `changeme-in-production-...` | Shared secret with Identity service (HS256) |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token lifetime (minutes) |
| `USE_MOCK_IDENTITY` | `true` | Use mock identity client (no real Identity service needed) |
| `IDENTITY_SERVICE_URL` | `http://identity-service:8001` | Real Identity service URL (used when `USE_MOCK_IDENTITY=false`) |
| `MIN_CREDIT_BALANCE` | `-2` | Minimum credit balance allowed (negative = debt permitted) |
| `CACHE_TTL_SECONDS` | `300` | Redis cache TTL for availability lists and match results |
| `LOG_LEVEL` | `INFO` | Log level: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `ENVIRONMENT` | `development` | `development`, `production`, or `test` |
| `SERVICE_PORT` | `8002` | Service HTTP port |

> **Production**: generate a 256-bit random `JWT_SECRET`, set `ENVIRONMENT=production`, set `USE_MOCK_IDENTITY=false`.

---

## DB Schema (ER Diagram)

```mermaid
erDiagram
    babysitting_requests {
        UUID id PK
        UUID requester_id "from JWT"
        date date
        time start_time
        time end_time
        varchar neighborhood
        int num_children
        json child_age_ranges "['2-4','6-8']"
        text notes
        enum status "OPEN|MATCHED|BOOKED|CANCELLED|COMPLETED"
        timestamptz created_at
        timestamptz updated_at
    }

    availabilities {
        UUID id PK
        UUID user_id "from JWT"
        int day_of_week "0=Mon..6=Sun (recurring only)"
        date date "one-off only"
        time start_time
        time end_time
        varchar neighborhood
        bool is_recurring
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }

    bookings {
        UUID id PK
        UUID request_id FK
        UUID requester_id
        UUID babysitter_id
        UUID availability_id FK
        date scheduled_date
        time start_time
        time end_time
        enum status "PENDING|ACCEPTED|COMPLETED|CANCELLED"
        numeric hours_credited
        timestamptz created_at
        timestamptz updated_at
    }

    credit_balances {
        UUID user_id PK
        numeric balance "hours"
        timestamptz updated_at
    }

    credit_transactions {
        UUID id PK
        UUID user_id
        UUID booking_id FK
        numeric amount "positive=earn, negative=spend"
        enum transaction_type "EARN|SPEND|ADJUSTMENT"
        varchar description
        numeric balance_after "snapshot"
        timestamptz created_at
    }

    ratings {
        UUID id PK
        UUID booking_id FK
        UUID rater_id
        UUID ratee_id
        int score "1-5"
        text comment
        timestamptz created_at
    }

    babysitting_requests ||--o{ bookings : "booked via"
    availabilities ||--o{ bookings : "used in"
    bookings ||--o{ credit_transactions : "triggers"
    bookings ||--o{ ratings : "rated after"
```

**Key constraints:**
- `bookings.request_id` is UNIQUE → one booking per request
- `ratings(booking_id, rater_id)` is UNIQUE → one rating per person per booking
- `ck_avail_recurring_xor_date` → availability is either recurring (day_of_week) **or** one-off (date), never both
- `ck_rating_no_self_rate` → rater_id ≠ ratee_id

---

## API Reference

All endpoints are prefixed with `/api/babysitting`.
Swagger UI: **http://localhost:8002/docs**

### Requests

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/requests` | ✅ | Create a babysitting request |
| `GET` | `/requests` | ✅ | List requests (filter: date, neighborhood, status, mine) |
| `GET` | `/requests/{id}` | ✅ | Get request by ID |
| `POST` | `/requests/{id}/accept` | ✅ | Accept a request (babysitter creates booking) |

### Availability

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/availability` | ✅ | List availability slots |
| `POST` | `/availability` | ✅ | Publish a new slot |
| `PUT` | `/availability/{id}` | ✅ | Update own slot |
| `DELETE` | `/availability/{id}` | ✅ | Soft-delete own slot |

### Bookings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/bookings` | ✅ | List my bookings (as requester and/or babysitter) |
| `PATCH` | `/bookings/{id}/cancel` | ✅ | Cancel a PENDING or ACCEPTED booking |
| `PATCH` | `/bookings/{id}/complete` | ✅ | Complete an ACCEPTED booking + transfer credits |

### Credits

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/credits` | ✅ | Get balance + transaction history |

### Ratings

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/ratings` | ✅ | Submit a rating for a completed booking |

### Matching

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/matches?request_id=...` | ✅ | Get ranked availability matches for a request |

### Dev (non-production)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/dev/token` | ❌ | Generate a test JWT |

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | ❌ | Health check |

---

## Event Contract

When a booking is accepted (`POST /requests/{id}/accept`), the service publishes a `BookingAccepted` event to:
- **Redis Stream**: `babysitting:events:booking_accepted` (durable, for missed messages)
- **Redis Pub/Sub channel**: `babysitting:pubsub:booking_accepted` (real-time)

### Event payload

```json
{
  "event_type": "BookingAccepted",
  "schema_version": "1.0",
  "booking_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "requester_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "babysitter_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "scheduled_date": "2026-11-15",
  "start_time": "09:00:00",
  "end_time": "17:00:00",
  "neighborhood": "Montmartre",
  "published_at": "2026-10-15T20:00:00Z"
}
```

> **Sprint 4 migration**: Replace `RedisEventPublisher` with `RabbitMQEventPublisher` by implementing the `EventPublisher` ABC. The rest of the codebase does not change.

---

## Running Tests

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run only unit tests
pytest tests/unit/

# Run only API tests
pytest tests/api/

# With verbose output and coverage
pytest -v --tb=short

# Run a specific test file
pytest tests/unit/test_matching.py -v
```

Tests use:
- **SQLite + aiosqlite** in-memory (no Postgres needed)
- **Mocked Redis** (no Redis needed)
- **MockIdentityClient** (no Identity service needed)

---

## Project Structure

```
babysitting-service/
├── app/
│   ├── main.py                    # FastAPI app factory + lifespan
│   ├── core/
│   │   ├── config.py              # Settings (pydantic-settings)
│   │   ├── logging.py             # structlog setup + request middleware
│   │   └── exceptions.py          # Exception hierarchy + global handlers
│   ├── db/
│   │   ├── session.py             # Async engine + get_db() dependency
│   │   └── base.py                # DeclarativeBase + model imports
│   ├── models/
│   │   ├── request.py             # BabysittingRequest
│   │   ├── availability.py        # Availability
│   │   ├── booking.py             # Booking
│   │   ├── credit.py              # CreditTransaction + CreditBalance
│   │   └── rating.py              # Rating
│   ├── schemas/
│   │   ├── request.py             # Pydantic schemas for requests
│   │   ├── availability.py        # Pydantic schemas for availability
│   │   ├── booking.py             # Pydantic schemas for bookings
│   │   ├── credit.py              # Pydantic schemas for credits
│   │   ├── rating.py              # Pydantic schemas for ratings
│   │   ├── matching.py            # Pydantic schemas for match results
│   │   └── common.py              # HealthResponse, ErrorResponse
│   ├── repositories/
│   │   ├── request_repository.py
│   │   ├── availability_repository.py
│   │   ├── booking_repository.py
│   │   ├── credit_repository.py   # Atomic ledger updates with row locks
│   │   └── rating_repository.py
│   ├── services/
│   │   ├── matching_service.py    # Scoring algorithm (4 dimensions)
│   │   └── booking_service.py     # State machine + double-booking prevention
│   ├── routers/
│   │   ├── requests.py
│   │   ├── availability.py
│   │   ├── bookings.py
│   │   ├── credits.py
│   │   ├── ratings.py
│   │   ├── matching.py
│   │   └── dev.py                 # Dev-only: test JWT generation
│   ├── security/
│   │   ├── jwt.py                 # JWT validation + test token creation
│   │   └── dependencies.py        # FastAPI auth dependencies
│   ├── clients/
│   │   └── identity_client.py     # HTTP + Mock identity client
│   ├── cache/
│   │   └── redis_client.py        # Redis wrapper (cache + locks + rate limit)
│   └── events/
│       └── publisher.py           # EventPublisher ABC + Redis + NoOp impls
├── alembic/
│   ├── env.py                     # Async Alembic env
│   ├── script.py.mako
│   └── versions/
│       └── 0001_initial.py        # Initial migration (all 6 tables)
├── tests/
│   ├── conftest.py                # Fixtures (SQLite, mock Redis, JWT helpers)
│   ├── unit/
│   │   ├── test_matching.py       # 20+ tests for scoring algorithm
│   │   ├── test_credits.py        # Ledger logic, balance enforcement
│   │   └── test_booking_state_machine.py  # State transitions, cancel, complete
│   └── api/
│       ├── test_requests_api.py   # Requests endpoint tests
│       ├── test_availability_api.py
│       └── test_credits_ratings_api.py
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── pyproject.toml
├── alembic.ini
└── README.md
```

---

## curl Examples

> Replace `TOKEN` with a JWT. Get one from `POST /dev/token` (dev mode).

### 1. Generate a test token

```bash
TOKEN=$(curl -s -X POST http://localhost:8002/dev/token \
  -H "Content-Type: application/json" \
  -d '{"role":"parent"}' | jq -r .access_token)

echo "Token: $TOKEN"
```

### 2. Create a babysitting request

```bash
curl -s -X POST http://localhost:8002/api/babysitting/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-11-15",
    "start_time": "09:00:00",
    "end_time": "17:00:00",
    "neighborhood": "Montmartre",
    "num_children": 2,
    "child_age_ranges": ["2-4", "6-8"],
    "notes": "Allergic to nuts"
  }' | jq
```

### 3. Publish an availability slot (as babysitter)

```bash
BS_TOKEN=$(curl -s -X POST http://localhost:8002/dev/token \
  -H "Content-Type: application/json" \
  -d '{"role":"babysitter"}' | jq -r .access_token)

curl -s -X POST http://localhost:8002/api/babysitting/availability \
  -H "Authorization: Bearer $BS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_recurring": false,
    "date": "2026-11-15",
    "start_time": "08:00:00",
    "end_time": "18:00:00",
    "neighborhood": "Montmartre"
  }' | jq
```

### 4. Get matches for a request

```bash
REQUEST_ID="<your-request-id>"
curl -s "http://localhost:8002/api/babysitting/matches?request_id=$REQUEST_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 5. Accept a request (babysitter accepts)

```bash
REQUEST_ID="<request-id>"
AVAIL_ID="<availability-id>"

curl -s -X POST "http://localhost:8002/api/babysitting/requests/$REQUEST_ID/accept" \
  -H "Authorization: Bearer $BS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"availability_id\": \"$AVAIL_ID\"}" | jq
```

### 6. Complete a booking (transfers time credits)

```bash
BOOKING_ID="<booking-id>"

curl -s -X PATCH "http://localhost:8002/api/babysitting/bookings/$BOOKING_ID/complete" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 7. Submit a rating

```bash
BOOKING_ID="<completed-booking-id>"

curl -s -X POST http://localhost:8002/api/babysitting/ratings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"booking_id\": \"$BOOKING_ID\",
    \"score\": 5,
    \"comment\": \"Wonderful with the kids, very reliable!\"
  }" | jq
```

### 8. Check credit balance

```bash
curl -s http://localhost:8002/api/babysitting/credits \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 9. Health check

```bash
curl -s http://localhost:8002/health | jq
```
