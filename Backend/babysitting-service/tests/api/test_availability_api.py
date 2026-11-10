"""
tests/api/test_availability_api.py
────────────────────────────────────
API-level tests for availability endpoints.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient


def tomorrow_str() -> str:
    return (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture
def one_off_payload():
    return {
        "is_recurring": False,
        "date": tomorrow_str(),
        "start_time": "09:00:00",
        "end_time": "18:00:00",
        "neighborhood": "Belleville",
    }


@pytest.fixture
def recurring_payload():
    return {
        "is_recurring": True,
        "day_of_week": 5,  # Saturday
        "start_time": "10:00:00",
        "end_time": "16:00:00",
        "neighborhood": "Montmartre",
    }


class TestCreateAvailability:
    @pytest.mark.asyncio
    async def test_create_one_off_success(
        self, client: AsyncClient, auth_headers_babysitter, one_off_payload
    ):
        resp = await client.post(
            "/api/babysitting/availability",
            json=one_off_payload,
            headers=auth_headers_babysitter,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_recurring"] is False
        assert data["neighborhood"] == "Belleville"
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_create_recurring_success(
        self, client: AsyncClient, auth_headers_babysitter, recurring_payload
    ):
        resp = await client.post(
            "/api/babysitting/availability",
            json=recurring_payload,
            headers=auth_headers_babysitter,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_recurring"] is True
        assert data["day_of_week"] == 5

    @pytest.mark.asyncio
    async def test_recurring_without_day_of_week_returns_422(
        self, client: AsyncClient, auth_headers_babysitter
    ):
        resp = await client.post(
            "/api/babysitting/availability",
            json={
                "is_recurring": True,
                # day_of_week missing
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "neighborhood": "Montmartre",
            },
            headers=auth_headers_babysitter,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_one_off_without_date_returns_422(
        self, client: AsyncClient, auth_headers_babysitter
    ):
        resp = await client.post(
            "/api/babysitting/availability",
            json={
                "is_recurring": False,
                # date missing
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "neighborhood": "Montmartre",
            },
            headers=auth_headers_babysitter,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(
        self, client: AsyncClient, one_off_payload
    ):
        resp = await client.post("/api/babysitting/availability", json=one_off_payload)
        assert resp.status_code == 401


class TestListAvailability:
    @pytest.mark.asyncio
    async def test_list_returns_200(
        self, client: AsyncClient, auth_headers_babysitter
    ):
        resp = await client.get(
            "/api/babysitting/availability", headers=auth_headers_babysitter
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data


class TestUpdateAvailability:
    @pytest.mark.asyncio
    async def test_update_own_availability(
        self, client: AsyncClient, auth_headers_babysitter, one_off_payload
    ):
        create_resp = await client.post(
            "/api/babysitting/availability",
            json=one_off_payload,
            headers=auth_headers_babysitter,
        )
        avail_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/babysitting/availability/{avail_id}",
            json={"neighborhood": "Canal Saint-Martin"},
            headers=auth_headers_babysitter,
        )
        assert resp.status_code == 200
        assert resp.json()["neighborhood"] == "Canal Saint-Martin"

    @pytest.mark.asyncio
    async def test_update_others_availability_returns_403(
        self,
        client: AsyncClient,
        auth_headers_babysitter,
        auth_headers_parent,
        one_off_payload,
    ):
        # Babysitter creates
        create_resp = await client.post(
            "/api/babysitting/availability",
            json=one_off_payload,
            headers=auth_headers_babysitter,
        )
        avail_id = create_resp.json()["id"]

        # Parent tries to update → 403
        resp = await client.put(
            f"/api/babysitting/availability/{avail_id}",
            json={"neighborhood": "Hacker"},
            headers=auth_headers_parent,
        )
        assert resp.status_code == 403


class TestDeleteAvailability:
    @pytest.mark.asyncio
    async def test_delete_own_availability_returns_204(
        self, client: AsyncClient, auth_headers_babysitter, one_off_payload
    ):
        create_resp = await client.post(
            "/api/babysitting/availability",
            json=one_off_payload,
            headers=auth_headers_babysitter,
        )
        avail_id = create_resp.json()["id"]

        resp = await client.delete(
            f"/api/babysitting/availability/{avail_id}",
            headers=auth_headers_babysitter,
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_nonexistent_returns_404(
        self, client: AsyncClient, auth_headers_babysitter
    ):
        resp = await client.delete(
            f"/api/babysitting/availability/{uuid.uuid4()}",
            headers=auth_headers_babysitter,
        )
        assert resp.status_code == 404
