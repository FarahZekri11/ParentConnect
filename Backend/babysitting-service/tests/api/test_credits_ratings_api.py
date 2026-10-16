"""
tests/api/test_credits_ratings_api.py
──────────────────────────────────────
API tests for the credits and ratings endpoints.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient


class TestCreditsEndpoint:
    @pytest.mark.asyncio
    async def test_get_credits_returns_200(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.get(
            "/api/babysitting/credits", headers=auth_headers_parent
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "balance" in data
        assert "transactions" in data
        assert "total_transactions" in data
        assert "user_id" in data

    @pytest.mark.asyncio
    async def test_get_credits_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/babysitting/credits")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_initial_balance_is_zero(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.get(
            "/api/babysitting/credits", headers=auth_headers_parent
        )
        data = resp.json()
        # New user should have 0 balance
        assert float(data["balance"]) == 0.0

    @pytest.mark.asyncio
    async def test_credits_pagination_params(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.get(
            "/api/babysitting/credits?limit=10&offset=0",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 200


class TestRatingsEndpoint:
    @pytest.mark.asyncio
    async def test_create_rating_nonexistent_booking_returns_404(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.post(
            "/api/babysitting/ratings",
            json={
                "booking_id": str(uuid.uuid4()),
                "score": 5,
                "comment": "Great!",
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_rating_score_out_of_range_returns_422(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.post(
            "/api/babysitting/ratings",
            json={
                "booking_id": str(uuid.uuid4()),
                "score": 6,  # out of range (max 5)
                "comment": "Too good",
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_rating_score_zero_returns_422(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.post(
            "/api/babysitting/ratings",
            json={
                "booking_id": str(uuid.uuid4()),
                "score": 0,  # out of range (min 1)
            },
            headers=auth_headers_parent,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_rating_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.post(
            "/api/babysitting/ratings",
            json={"booking_id": str(uuid.uuid4()), "score": 5},
        )
        assert resp.status_code == 401


class TestMatchingEndpoint:
    @pytest.mark.asyncio
    async def test_matches_nonexistent_request_returns_404(
        self, client: AsyncClient, auth_headers_parent
    ):
        fake_id = uuid.uuid4()
        resp = await client.get(
            f"/api/babysitting/matches?request_id={fake_id}",
            headers=auth_headers_parent,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_matches_missing_request_id_returns_422(
        self, client: AsyncClient, auth_headers_parent
    ):
        resp = await client.get(
            "/api/babysitting/matches",  # no request_id
            headers=auth_headers_parent,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_matches_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.get(
            f"/api/babysitting/matches?request_id={uuid.uuid4()}"
        )
        assert resp.status_code == 401
