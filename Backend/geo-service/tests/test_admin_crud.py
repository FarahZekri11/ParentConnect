"""CRUD complémentaire : quartiers et points de rencontre (ADMIN), retrait de ma position, statistiques."""
import pytest
from httpx import AsyncClient

from tests.test_neighborhoods import SAMPLE_NEIGHBORHOOD_PAYLOAD


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_updates_and_deletes_neighborhood(client: AsyncClient, admin_token: str, user_alice_token: str):
    created = (await client.post("/api/geo/neighborhoods", json=SAMPLE_NEIGHBORHOOD_PAYLOAD,
                                 headers=auth(admin_token))).json()
    nid = created["id"]

    point = {"neighborhood_id": nid, "name": "Parc du Belvédère", "type": "park",
             "location": {"type": "Point", "coordinates": [10.18, 36.806]}}
    mp = await client.post("/api/geo/meeting-points", json=point, headers=auth(admin_token))
    assert mp.status_code == 201

    renamed = {**SAMPLE_NEIGHBORHOOD_PAYLOAD, "name": "Lafayette Nord"}
    assert (await client.put(f"/api/geo/neighborhoods/{nid}", json=renamed, headers=auth(user_alice_token))).status_code == 403
    r = await client.put(f"/api/geo/neighborhoods/{nid}", json=renamed, headers=auth(admin_token))
    assert r.status_code == 200 and r.json()["name"] == "Lafayette Nord"
    # Modification persistée
    assert (await client.get(f"/api/geo/neighborhoods/{nid}", headers=auth(user_alice_token))).json()["name"] == "Lafayette Nord"

    assert (await client.delete(f"/api/geo/neighborhoods/{nid}", headers=auth(user_alice_token))).status_code == 403
    assert (await client.delete(f"/api/geo/neighborhoods/{nid}", headers=auth(admin_token))).status_code == 204
    assert (await client.get(f"/api/geo/neighborhoods/{nid}", headers=auth(admin_token))).status_code == 404
    # Ses points de rencontre sont supprimés avec lui
    remaining = (await client.get("/api/geo/meeting-points", params={"neighborhoodId": nid}, headers=auth(admin_token))).json()
    assert remaining == []
    assert (await client.delete("/api/geo/neighborhoods/zzz", headers=auth(admin_token))).status_code == 404


@pytest.mark.asyncio
async def test_admin_updates_and_deletes_meeting_point(client: AsyncClient, admin_token: str, user_alice_token: str):
    nid = (await client.post("/api/geo/neighborhoods", json=SAMPLE_NEIGHBORHOOD_PAYLOAD,
                             headers=auth(admin_token))).json()["id"]
    point = {"neighborhood_id": nid, "name": "Crèche municipale", "type": "daycare",
             "location": {"type": "Point", "coordinates": [10.181, 36.807]}}
    pid = (await client.post("/api/geo/meeting-points", json=point, headers=auth(admin_token))).json()["id"]

    assert (await client.put(f"/api/geo/meeting-points/{pid}", json={"name": "x" * 3},
                             headers=auth(user_alice_token))).status_code == 403
    r = await client.put(f"/api/geo/meeting-points/{pid}", json={"name": "Mairie", "type": "town_hall"},
                         headers=auth(admin_token))
    assert r.status_code == 200 and r.json()["name"] == "Mairie" and r.json()["type"] == "town_hall"
    all_points = (await client.get("/api/geo/meeting-points", headers=auth(user_alice_token))).json()
    assert any(p["id"] == pid for p in all_points)

    assert (await client.delete(f"/api/geo/meeting-points/{pid}", headers=auth(admin_token))).status_code == 204
    assert (await client.delete(f"/api/geo/meeting-points/{pid}", headers=auth(admin_token))).status_code == 404


@pytest.mark.asyncio
async def test_user_removes_own_location(client: AsyncClient, user_alice_token: str):
    assert (await client.post("/api/geo/locations", json={"lng": 10.1815, "lat": 36.8065},
                              headers=auth(user_alice_token))).status_code == 200
    assert (await client.get("/api/geo/locations/me", headers=auth(user_alice_token))).status_code == 200
    assert (await client.delete("/api/geo/locations/me", headers=auth(user_alice_token))).status_code == 204
    assert (await client.get("/api/geo/locations/me", headers=auth(user_alice_token))).status_code == 404
    assert (await client.delete("/api/geo/locations/me", headers=auth(user_alice_token))).status_code == 404


@pytest.mark.asyncio
async def test_admin_stats(client: AsyncClient, admin_token: str, user_alice_token: str):
    await client.post("/api/geo/locations", json={"lng": 10.1815, "lat": 36.8065}, headers=auth(user_alice_token))
    assert (await client.get("/api/geo/admin/stats", headers=auth(user_alice_token))).status_code == 403
    stats = (await client.get("/api/geo/admin/stats", headers=auth(admin_token))).json()
    assert stats["located_users"] == 1
