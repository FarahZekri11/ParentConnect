import pytest
from httpx import AsyncClient
from tests.conftest import create_token


@pytest.mark.asyncio
async def test_nearby_aggregation_and_caller_exclusion(client: AsyncClient, user_alice_token: str):
    """
    Nearby aggregation tests:
    - Finds registered parents within radius
    - Excludes the caller
    - Returns anonymized records with 100m rounded distance
    """
    token_bob = create_token("user_bob")
    token_charlie = create_token("user_charlie")
    token_far_away = create_token("user_far_away")

    # 1. Register Alice at center (10.1815, 36.8065)
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1815, "lat": 36.8065},
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )

    # 2. Register Bob close by (10.1825, 36.8075) ~150m
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1825, "lat": 36.8075},
        headers={"Authorization": f"Bearer {token_bob}"}
    )

    # 3. Register Charlie moderate distance (10.1880, 36.8120) ~800m
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1880, "lat": 36.8120},
        headers={"Authorization": f"Bearer {token_charlie}"}
    )

    # 4. Register Far Away user (10.3500, 36.9000) ~15km
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.3500, "lat": 36.9000},
        headers={"Authorization": f"Bearer {token_far_away}"}
    )

    # Alice searches for parents within 2000m radius
    res = await client.get(
        "/api/geo/nearby?lng=10.1815&lat=36.8065&radius=2000",
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )
    assert res.status_code == 200
    results = res.json()

    user_ids = [r["user_id"] for r in results]

    # Rule: Caller (Alice) MUST NOT appear in results
    assert "user_alice" not in user_ids

    # Bob and Charlie are within 2000m
    assert "user_bob" in user_ids
    assert "user_charlie" in user_ids

    # Far away user must not appear
    assert "user_far_away" not in user_ids

    # Rule: Anti-triangulation rounding (distance_m must be multiple of 100)
    for r in results:
        # Check that distance is rounded to 100m
        assert r["distance_m"] % 100 == 0.0, f"Distance {r['distance_m']} not rounded to 100m"
        # No coordinates or personal identity leaked
        assert "location" not in r
        assert "name" not in r


@pytest.mark.asyncio
async def test_nearby_radius_validation_422(client: AsyncClient, user_alice_token: str):
    """Radius <= 0 or > MAX_SEARCH_RADIUS_M must return 422."""
    headers = {"Authorization": f"Bearer {user_alice_token}"}

    # Radius = 0
    res_zero = await client.get(
        "/api/geo/nearby?lng=10.18&lat=36.80&radius=0",
        headers=headers
    )
    assert res_zero.status_code == 422

    # Radius > 10000m (max)
    res_too_large = await client.get(
        "/api/geo/nearby?lng=10.18&lat=36.80&radius=15000",
        headers=headers
    )
    assert res_too_large.status_code == 422
