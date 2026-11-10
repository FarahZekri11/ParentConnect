"""
tests/api/test_requests_api.py
────────────────────────────────
API-level tests for the babysitting requests endpoints.
Uses httpx AsyncClient against the real FastAPI app with mocked Redis
and SQLite in-memory DB (from conftest.py).
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.security.jwt import create_test_jwt


def tomorrow_str() -> str:
    return (date.today() + timedelta(days=1)).isoformat()


def next_week_str() -> str:
    return (date.today() + timedelta(days=7)).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def valid_request_body():
    return {
        "date": tomorrow_str(),
        "start_time": "09:00:00",
        "end_time": "17:00:00",
        "neighborhood": "Montmartre",
        "num_children": 2,
        "child_age_ranges": ["2-4", "6-8"],
        "notes": "Allergic to nuts",
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/babysitting/requests
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateRequest:
    @pytest.mark.asyncio
    async def test_create_request_success(
        self, client: AsyncClient, auth_headers_parent, valid_request_body
    ):
        resp = await client.post(
            "/api/babysitting/requests",
            json=valid_request_body,
            headers=auth_headers_parent,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "OPEN"
        assert data["neighborhood"] == "Montmartre"
        assert data["num_children"] == 2
        assert data["child_age_ranges"] == ["2-4", "6-8"]
        assert "id" in data
        assert "requester_id" in data

    @pytest.mark.asyncio
    async def test_create_request_without_auth_returns_401(
        self, client: AsyncClient, valid_request_body
    ):
        resp = await client.post("/api/babysitting/requests", json=valid_request_body)
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_request_end_before_start_returns_422(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.post(
            "/api/babysitting/requests",
            json={
                "date": tomorrow_str(),
                "start_time": "17:00:00",
                "end_time": "09:00:00",   # end before start
                "neighborhood": "Montmartre",
                "num_children": 1,
                "child_age_ranges": ["2-4"],
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_request_mismatched_child_counts_returns_422(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.post(
            "/api/babysitting/requests",
            json={
                "date": tomorrow_str(),
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "neighborhood": "Montmartre",
                "num_children": 3,
                "child_age_ranges": ["2-4", "6-8"],  # only 2 ranges for 3 children
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_request_zero_children_returns_422(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.post(
            "/api/babysitting/requests",
            json={
                "date": tomorrow_str(),
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "neighborhood": "X",
                "num_children": 0,
                "child_age_ranges": [],
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/babysitting/requests
# ─────────────────────────────────────────────────────────────────────────────

class TestListRequests:
    @pytest.mark.asyncio
    async def test_list_requests_returns_200(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.get(
            "/api/babysitting/requests", headers=auth_headers_parent
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data

    @pytest.mark.asyncio
    async def test_list_requests_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/babysitting/requests")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_requests_pagination(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.get(
            "/api/babysitting/requests?page=1&page_size=5",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["page_size"] == 5

    @pytest.mark.asyncio
    async def test_created_request_appears_in_list(
        self, client: AsyncClient, auth_headers_parent, valid_request_body
    ):
        # Create first
        create_resp = await client.post(
            "/api/babysitting/requests",
            json=valid_request_body,
            headers=auth_headers_parent,
        )
        assert create_resp.status_code == 201
        created_id = create_resp.json()["id"]

        # Then list
        list_resp = await client.get(
            "/api/babysitting/requests?mine=true", headers=auth_headers_parent
        )
        assert list_resp.status_code == 200
        ids = [r["id"] for r in list_resp.json()["items"]]
        assert created_id in ids


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/babysitting/requests/{id}
# ─────────────────────────────────────────────────────────────────────────────

class TestGetRequest:
    @pytest.mark.asyncio
    async def test_get_existing_request(
        self, client: AsyncClient, auth_headers_parent, valid_request_body
    ):
        create_resp = await client.post(
            "/api/babysitting/requests",
            json=valid_request_body,
            headers=auth_headers_parent,
        )
        request_id = create_resp.json()["id"]

        resp = await client.get(
            f"/api/babysitting/requests/{request_id}", headers=auth_headers_parent
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == request_id

    @pytest.mark.asyncio
    async def test_get_nonexistent_request_returns_404(
        self, client: AsyncClient, auth_headers_parent
    ):
        fake_id = uuid.uuid4()
        resp = await client.get(
            f"/api/babysitting/requests/{fake_id}", headers=auth_headers_parent
        )
        assert resp.status_code == 404
        assert resp.json()["error_code"] == "NOT_FOUND"


# ─────────────────────────────────────────────────────────────────────────────
# Health endpoint
# ─────────────────────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_ok(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "babysitting-service"
        assert "version" in data
        assert "timestamp" in data

    @pytest.mark.asyncio
    async def test_health_no_auth_required(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# Dev token endpoint
# ─────────────────────────────────────────────────────────────────────────────

class TestDevToken:
    @pytest.mark.asyncio
    async def test_generate_token_returns_jwt(self, client: AsyncClient):
        resp = await client.post(
            "/dev/token",
            json={"role": "parent"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["role"] == "parent"

    @pytest.mark.asyncio
    async def test_generated_token_is_valid(self, client: AsyncClient):
        resp = await client.post("/dev/token", json={"role": "babysitter"})
        token = resp.json()["access_token"]

        # Use the token to call a protected endpoint
        list_resp = await client.get(
            "/api/babysitting/requests",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert list_resp.status_code == 200
