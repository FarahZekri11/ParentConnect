import pytest
from httpx import AsyncClient
from app.services.geo_service import haversine_distance_m


SAMPLE_NEIGHBORHOOD_PAYLOAD = {
    "name": "Lafayette",
    "city": "Tunis",
    "center": {"type": "Point", "coordinates": [10.1815, 36.8065]},
    "boundary": {
        "type": "Polygon",
        "coordinates": [[
            [10.1750, 36.8020],
            [10.1880, 36.8020],
            [10.1880, 36.8120],
            [10.1750, 36.8120],
            [10.1750, 36.8020]
        ]]
    }
}


@pytest.mark.asyncio
async def test_register_location_server_side_blur(
    client: AsyncClient, admin_token: str, user_alice_token: str
):
    """Register location blurs coordinates server-side and attaches neighborhood."""
    # 1. Create neighborhood
    await client.post(
        "/api/geo/neighborhoods",
        json=SAMPLE_NEIGHBORHOOD_PAYLOAD,
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    # 2. Alice registers her raw position inside Lafayette
    raw_lng, raw_lat = 10.1815, 36.8065
    res = await client.post(
        "/api/geo/locations",
        json={"lng": raw_lng, "lat": raw_lat},
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["user_id"] == "user_alice"
    assert data["precision_m"] == 200.0
    assert data["neighborhood_id"] is not None

    blurred_coords = data["location"]["coordinates"]
    # Exact coordinates must never be stored!
    assert (blurred_coords[0], blurred_coords[1]) != (raw_lng, raw_lat)

    # Distance between raw and blurred must be <= 200m
    dist = haversine_distance_m(raw_lng, raw_lat, blurred_coords[0], blurred_coords[1])
    assert dist <= 205.0


@pytest.mark.asyncio
async def test_get_my_location(client: AsyncClient, user_alice_token: str):
    """GET /locations/me returns 404 initially, then 200 after registration."""
    headers = {"Authorization": f"Bearer {user_alice_token}"}

    # Not registered yet
    res_before = await client.get("/api/geo/locations/me", headers=headers)
    assert res_before.status_code == 404

    # Register
    await client.post("/api/geo/locations", json={"lng": 10.18, "lat": 36.80}, headers=headers)

    # Now registered
    res_after = await client.get("/api/geo/locations/me", headers=headers)
    assert res_after.status_code == 200
    assert res_after.json()["user_id"] == "user_alice"
    assert res_after.json()["location"] is not None


@pytest.mark.asyncio
async def test_stable_blur_across_repeated_updates(client: AsyncClient, user_alice_token: str):
    """Repeated location registrations by the same user with the same coordinates yield stable blurred points."""
    headers = {"Authorization": f"Bearer {user_alice_token}"}
    raw_pos = {"lng": 10.1815, "lat": 36.8065}

    res1 = await client.post("/api/geo/locations", json=raw_pos, headers=headers)
    res2 = await client.post("/api/geo/locations", json=raw_pos, headers=headers)

    assert res1.json()["location"]["coordinates"] == res2.json()["location"]["coordinates"]


@pytest.mark.asyncio
async def test_user_proximity_between_parents(
    client: AsyncClient, user_alice_token: str, user_bob_token: str
):
    """GET /users/{id}/proximity calculates distance in meters between caller and target."""
    # Alice at (10.1815, 36.8065)
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1815, "lat": 36.8065},
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )
    # Bob at (10.1850, 36.8080)
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1850, "lat": 36.8080},
        headers={"Authorization": f"Bearer {user_bob_token}"}
    )

    # Alice asks for proximity to Bob
    res = await client.get(
        "/api/geo/users/user_bob/proximity",
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["target_user_id"] == "user_bob"
    assert "distance_m" in data
    # Approximate distance between these two points is ~300-600m
    assert 50 <= data["distance_m"] <= 1000
