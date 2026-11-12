import pytest
from httpx import AsyncClient
from tests.conftest import create_token


@pytest.mark.asyncio
async def test_address_verification_and_neighbor_validation_flow(
    client: AsyncClient, user_alice_token: str
):
    """
    Test complete address verification lifecycle:
    1. Alice initiates address verification (starts pending).
    2. Alice attempts to validate her own address -> 400 Bad Request.
    3. Bob validates Alice's address (1/2 validations).
    4. Bob attempts duplicate validation -> 400 Bad Request.
    5. Charlie validates Alice's address (2/2 validations reached).
    6. Status updates to 'verified' and user_locations is updated.
    """
    token_bob = create_token("user_bob")
    token_charlie = create_token("user_charlie")

    # Alice registers location first
    await client.post(
        "/api/geo/locations",
        json={"lng": 10.1815, "lat": 36.8065},
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )

    # 1. Alice initiates verification
    res_verify = await client.post(
        "/api/geo/addresses/verify",
        json={"method": "neighbor_validation"},
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )
    assert res_verify.status_code == 201
    verification_data = res_verify.json()
    verification_id = verification_data["id"]
    assert verification_data["status"] == "pending"
    assert verification_data["user_id"] == "user_alice"

    # 2. Alice tries self-validation -> 400
    res_self = await client.post(
        f"/api/geo/addresses/{verification_id}/validate",
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )
    assert res_self.status_code == 400
    assert "own address" in res_self.json()["detail"].lower()

    # 3. Bob validates Alice's address (1st validation)
    res_bob = await client.post(
        f"/api/geo/addresses/{verification_id}/validate",
        headers={"Authorization": f"Bearer {token_bob}"}
    )
    assert res_bob.status_code == 200
    data_bob = res_bob.json()
    assert data_bob["validations_count"] == 1
    assert data_bob["is_fully_verified"] is False
    assert data_bob["status"] == "pending"

    # 4. Bob tries duplicate validation -> 400
    res_bob_dup = await client.post(
        f"/api/geo/addresses/{verification_id}/validate",
        headers={"Authorization": f"Bearer {token_bob}"}
    )
    assert res_bob_dup.status_code == 400
    assert "already validated" in res_bob_dup.json()["detail"].lower()

    # 5. Charlie validates Alice's address (2nd validation, reaches threshold = 2)
    res_charlie = await client.post(
        f"/api/geo/addresses/{verification_id}/validate",
        headers={"Authorization": f"Bearer {token_charlie}"}
    )
    assert res_charlie.status_code == 200
    data_charlie = res_charlie.json()
    assert data_charlie["validations_count"] == 2
    assert data_charlie["is_fully_verified"] is True
    assert data_charlie["status"] == "verified"

    # 6. Check that Alice's user_locations verified status is now True
    loc_res = await client.get(
        "/api/geo/locations/me",
        headers={"Authorization": f"Bearer {user_alice_token}"}
    )
    assert loc_res.status_code == 200
    assert loc_res.json()["verified"] is True


@pytest.mark.asyncio
async def test_trust_circles_upsert_and_retrieval(client: AsyncClient, user_alice_token: str):
    """Creating and updating trust circles with upsert behavior."""
    headers = {"Authorization": f"Bearer {user_alice_token}"}

    # 1. Upsert close circle with Bob
    res1 = await client.post(
        "/api/geo/circles",
        json={"level": "close", "members": ["user_bob"]},
        headers=headers
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["level"] == "close"
    assert data1["members"] == ["user_bob"]

    # 2. Update close circle with Bob and Charlie (upsert by owner_id + level)
    res2 = await client.post(
        "/api/geo/circles",
        json={"level": "close", "members": ["user_bob", "user_charlie"]},
        headers=headers
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["level"] == "close"
    assert set(data2["members"]) == {"user_bob", "user_charlie"}

    # 3. Retrieve user circles
    res_list = await client.get("/api/geo/circles", headers=headers)
    assert res_list.status_code == 200
    circles = res_list.json()
    assert len(circles) >= 1
    assert circles[0]["level"] == "close"


@pytest.mark.asyncio
async def test_meeting_points_by_neighborhood(
    client: AsyncClient, admin_token: str, user_alice_token: str
):
    """Admin creates meeting point, user queries by neighborhood."""
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_user = {"Authorization": f"Bearer {user_alice_token}"}

    # Create meeting point in neighborhood nh_123
    create_payload = {
        "neighborhood_id": "nh_123",
        "name": "Parc du Belvédère",
        "type": "park",
        "location": {"type": "Point", "coordinates": [10.1710, 36.8250]}
    }
    create_res = await client.post(
        "/api/geo/meeting-points",
        json=create_payload,
        headers=headers_admin
    )
    assert create_res.status_code == 201

    # User lists meeting points for nh_123
    list_res = await client.get(
        "/api/geo/meeting-points?neighborhoodId=nh_123",
        headers=headers_user
    )
    assert list_res.status_code == 200
    pts = list_res.json()
    assert len(pts) >= 1
    assert pts[0]["name"] == "Parc du Belvédère"
    assert pts[0]["type"] == "park"
