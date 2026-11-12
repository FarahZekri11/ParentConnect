import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_public_endpoint_unauthorized_without_token(client: AsyncClient):
    """Calling protected endpoint without Authorization header must return 401."""
    res = await client.get("/api/geo/locations/me")
    assert res.status_code == 401
    assert "detail" in res.json()


@pytest.mark.asyncio
async def test_public_endpoint_unauthorized_with_invalid_token(client: AsyncClient):
    """Calling protected endpoint with an invalid or tampered token must return 401."""
    headers = {"Authorization": "Bearer invalid.jwt.token"}
    res = await client.get("/api/geo/locations/me", headers=headers)
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_public_endpoint_unauthorized_with_expired_token(
    client: AsyncClient, expired_token: str
):
    """Calling protected endpoint with an expired token must return 401."""
    headers = {"Authorization": f"Bearer {expired_token}"}
    res = await client.get("/api/geo/locations/me", headers=headers)
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_admin_route_forbidden_for_user(client: AsyncClient, user_alice_token: str):
    """Accessing an admin-only endpoint with a regular USER token must return 403."""
    headers = {"Authorization": f"Bearer {user_alice_token}"}
    res = await client.post(
        "/api/geo/neighborhoods",
        json={
            "name": "Test",
            "city": "Tunis",
            "center": {"type": "Point", "coordinates": [10.18, 36.80]},
            "boundary": {
                "type": "Polygon",
                "coordinates": [[[10.0, 36.0], [10.1, 36.0], [10.1, 36.1], [10.0, 36.1], [10.0, 36.0]]]
            }
        },
        headers=headers
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_internal_endpoint_forbidden_without_internal_key(client: AsyncClient):
    """Calling /internal/geo without X-Internal-Key header must return 403."""
    res = await client.get("/internal/geo/users-within?lat=36.80&lng=10.18&radius=1000")
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_internal_endpoint_forbidden_with_wrong_internal_key(client: AsyncClient):
    """Calling /internal/geo with incorrect X-Internal-Key must return 403."""
    headers = {"X-Internal-Key": "wrong-secret-key"}
    res = await client.get(
        "/internal/geo/users-within?lat=36.80&lng=10.18&radius=1000",
        headers=headers
    )
    assert res.status_code == 403
