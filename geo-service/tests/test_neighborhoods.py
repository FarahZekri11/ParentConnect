import pytest
from httpx import AsyncClient

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
async def test_create_neighborhood_as_admin(client: AsyncClient, admin_token: str):
    """Admin can successfully create a new neighborhood."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = await client.post(
        "/api/geo/neighborhoods",
        json=SAMPLE_NEIGHBORHOOD_PAYLOAD,
        headers=headers
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Lafayette"
    assert data["city"] == "Tunis"
    assert "id" in data
    assert data["boundary"]["type"] == "Polygon"


@pytest.mark.asyncio
async def test_create_neighborhood_forbidden_for_regular_user(
    client: AsyncClient, user_alice_token: str
):
    """Regular user receives 403 Forbidden when trying to create a neighborhood."""
    headers = {"Authorization": f"Bearer {user_alice_token}"}
    response = await client.post(
        "/api/geo/neighborhoods",
        json=SAMPLE_NEIGHBORHOOD_PAYLOAD,
        headers=headers
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_neighborhood_by_id(client: AsyncClient, admin_token: str, user_alice_token: str):
    """Can retrieve a created neighborhood by its ID."""
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    create_res = await client.post(
        "/api/geo/neighborhoods",
        json=SAMPLE_NEIGHBORHOOD_PAYLOAD,
        headers=headers_admin
    )
    neighborhood_id = create_res.json()["id"]

    headers_user = {"Authorization": f"Bearer {user_alice_token}"}
    get_res = await client.get(
        f"/api/geo/neighborhoods/{neighborhood_id}",
        headers=headers_user
    )
    assert get_res.status_code == 200
    assert get_res.json()["id"] == neighborhood_id


@pytest.mark.asyncio
async def test_get_neighborhood_by_point_geo_intersects(
    client: AsyncClient, admin_token: str, user_alice_token: str
):
    """Spatial query using $geoIntersects detects neighborhood correctly."""
    # 1. Create Lafayette neighborhood
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    await client.post(
        "/api/geo/neighborhoods",
        json=SAMPLE_NEIGHBORHOOD_PAYLOAD,
        headers=headers_admin
    )

    headers_user = {"Authorization": f"Bearer {user_alice_token}"}

    # Point INSIDE Lafayette: lng=10.1815, lat=36.8065
    res_inside = await client.get(
        "/api/geo/neighborhoods/by-point?lng=10.1815&lat=36.8065",
        headers=headers_user
    )
    assert res_inside.status_code == 200
    assert res_inside.json()["name"] == "Lafayette"

    # Point OUTSIDE Lafayette: lng=10.3000, lat=36.9000
    res_outside = await client.get(
        "/api/geo/neighborhoods/by-point?lng=10.3000&lat=36.9000",
        headers=headers_user
    )
    assert res_outside.status_code == 404


@pytest.mark.asyncio
async def test_by_point_coordinate_validation_422(client: AsyncClient, user_alice_token: str):
    """Invalid coordinates must return 422 Unprocessable Entity."""
    headers = {"Authorization": f"Bearer {user_alice_token}"}
    # Latitude out of bounds (> 90)
    res = await client.get(
        "/api/geo/neighborhoods/by-point?lng=10.1815&lat=95.0",
        headers=headers
    )
    assert res.status_code == 422
