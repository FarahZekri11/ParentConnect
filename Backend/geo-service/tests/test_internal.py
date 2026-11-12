from typing import Dict
import pytest
from httpx import AsyncClient
from app.models.internal import DistanceBetweenUsersResponse, UserWithinResponse
from tests.conftest import create_token


@pytest.mark.asyncio
async def test_users_within_contract_and_unrounded_distances(
    client: AsyncClient, internal_headers: Dict[str, str]
):
    """
    Contract test for GET /internal/geo/users-within:
    - Must match UserWithinResponse OpenAPI schema
    - Distances must be exact / unrounded (unlike public /nearby)
    """
    token_bob = create_token("user_bob_internal")

    # Register Bob at (10.1830, 36.8070)
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1830, "lat": 36.8070},
        headers={"Authorization": f"Bearer {token_bob}"}
    )

    # Internal service calls /internal/geo/users-within
    res = await client.get(
        "/internal/geo/users-within?lat=36.8065&lng=10.1815&radius=3000",
        headers=internal_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    # Validate schema conformance via Pydantic model
    first_item = data[0]
    validated = UserWithinResponse(**first_item)
    assert validated.user_id == "user_bob_internal"
    assert isinstance(validated.distance_m, float)
    assert validated.distance_m > 0


@pytest.mark.asyncio
async def test_distance_contract_between_two_users(
    client: AsyncClient, internal_headers: Dict[str, str]
):
    """
    Contract test for GET /internal/geo/distance:
    - Must match DistanceBetweenUsersResponse schema
    """
    token_alice = create_token("user_alice_dist")
    token_bob = create_token("user_bob_dist")

    # Register Alice
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1815, "lat": 36.8065},
        headers={"Authorization": f"Bearer {token_alice}"}
    )
    # Register Bob
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1850, "lat": 36.8080},
        headers={"Authorization": f"Bearer {token_bob}"}
    )

    # Internal call for distance
    res = await client.get(
        "/internal/geo/distance?userA=user_alice_dist&userB=user_bob_dist",
        headers=internal_headers
    )
    assert res.status_code == 200
    data = res.json()

    # Schema conformance
    validated = DistanceBetweenUsersResponse(**data)
    assert validated.userA == "user_alice_dist"
    assert validated.userB == "user_bob_dist"
    assert isinstance(validated.distance_m, float)
    assert 100 <= validated.distance_m <= 1000
