"""
tests/api/test_roles_and_crud_api.py
────────────────────────────────────
Permissions par rôle (PARENT / BABYSITTER / ADMIN), modification et suppression des demandes,
recherche de babysitters et statistiques administrateur.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.security.jwt import create_test_jwt

BASE = "/api/babysitting"


def headers(user_id: uuid.UUID, role: str) -> dict:
    return {"Authorization": f"Bearer {create_test_jwt(user_id, role, secret='test-secret-key')}"}


@pytest.fixture
def admin_headers() -> dict:
    return headers(uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"), "ADMIN")


@pytest.mark.asyncio
async def test_babysitter_cannot_create_request(client: AsyncClient, auth_headers_babysitter, sample_request_payload):
    r = await client.post(f"{BASE}/requests", json=sample_request_payload, headers=auth_headers_babysitter)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_parent_cannot_publish_availability(client: AsyncClient, auth_headers_parent, sample_availability_payload):
    r = await client.post(f"{BASE}/availability", json=sample_availability_payload, headers=auth_headers_parent)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_owner_updates_request(client: AsyncClient, auth_headers_parent, sample_request_payload):
    created = (await client.post(f"{BASE}/requests", json=sample_request_payload, headers=auth_headers_parent)).json()
    r = await client.put(f"{BASE}/requests/{created['id']}",
                         json={"neighborhood": "Belleville", "num_children": 3, "notes": "Modifié"},
                         headers=auth_headers_parent)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["neighborhood"] == "Belleville" and body["num_children"] == 3 and body["notes"] == "Modifié"
    # La modification est persistée
    again = (await client.get(f"{BASE}/requests/{created['id']}", headers=auth_headers_parent)).json()
    assert again["neighborhood"] == "Belleville"


@pytest.mark.asyncio
async def test_update_rejects_bad_times(client: AsyncClient, auth_headers_parent, sample_request_payload):
    created = (await client.post(f"{BASE}/requests", json=sample_request_payload, headers=auth_headers_parent)).json()
    r = await client.put(f"{BASE}/requests/{created['id']}", json={"end_time": "08:00:00"}, headers=auth_headers_parent)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_other_user_cannot_update_or_delete(client: AsyncClient, auth_headers_parent, sample_request_payload):
    created = (await client.post(f"{BASE}/requests", json=sample_request_payload, headers=auth_headers_parent)).json()
    other = headers(uuid.uuid4(), "PARENT")
    assert (await client.put(f"{BASE}/requests/{created['id']}", json={"notes": "x"}, headers=other)).status_code == 403
    assert (await client.delete(f"{BASE}/requests/{created['id']}", headers=other)).status_code == 403


@pytest.mark.asyncio
async def test_owner_deletes_request(client: AsyncClient, auth_headers_parent, sample_request_payload):
    created = (await client.post(f"{BASE}/requests", json=sample_request_payload, headers=auth_headers_parent)).json()
    r = await client.delete(f"{BASE}/requests/{created['id']}", headers=auth_headers_parent)
    assert r.status_code == 204
    assert (await client.get(f"{BASE}/requests/{created['id']}", headers=auth_headers_parent)).status_code == 404


@pytest.mark.asyncio
async def test_admin_moderates_request(client: AsyncClient, auth_headers_parent, admin_headers, sample_request_payload):
    created = (await client.post(f"{BASE}/requests", json=sample_request_payload, headers=auth_headers_parent)).json()
    r = await client.put(f"{BASE}/requests/{created['id']}", json={"notes": "Modéré"}, headers=admin_headers)
    assert r.status_code == 200
    assert (await client.delete(f"{BASE}/requests/{created['id']}", headers=admin_headers)).status_code == 204


@pytest.mark.asyncio
async def test_search_babysitters(client: AsyncClient, auth_headers_parent, auth_headers_babysitter,
                                  sample_availability_payload):
    # Quartier unique : la base SQLite de test est partagée entre les tests
    hood = f"Quartier-{uuid.uuid4().hex[:8]}"
    payload = {**sample_availability_payload, "neighborhood": hood}
    r = await client.post(f"{BASE}/availability", json=payload, headers=auth_headers_babysitter)
    assert r.status_code == 201, r.text
    found = (await client.get(f"{BASE}/availability/search", params={"neighborhood": hood[:12].lower()},
                              headers=auth_headers_parent)).json()
    assert found["total"] == 1
    assert found["items"][0]["neighborhood"] == hood
    none = (await client.get(f"{BASE}/availability/search", params={"neighborhood": "Introuvable-xyz"},
                             headers=auth_headers_parent)).json()
    assert none["total"] == 0
    by_date = (await client.get(f"{BASE}/availability/search",
                                params={"date": payload["date"], "neighborhood": hood},
                                headers=auth_headers_parent)).json()
    assert by_date["total"] == 1
    # Le babysitter ne se voit pas lui-même dans la recherche
    own = (await client.get(f"{BASE}/availability/search", params={"neighborhood": hood},
                            headers=auth_headers_babysitter)).json()
    assert own["total"] == 0


@pytest.mark.asyncio
async def test_admin_stats(client: AsyncClient, auth_headers_parent, admin_headers, sample_request_payload):
    await client.post(f"{BASE}/requests", json=sample_request_payload, headers=auth_headers_parent)
    assert (await client.get(f"{BASE}/admin/stats", headers=auth_headers_parent)).status_code == 403
    r = await client.get(f"{BASE}/admin/stats", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["requests"] >= 1
