import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_liveness_probe(client: AsyncClient):
    """GET /health must return 200 and status ok."""
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_ready_probe(client: AsyncClient):
    """GET /ready must return 200 and mongo=True when DB is connected."""
    res = await client.get("/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["mongo"] is True
    # rabbitmq is false in offline test environment
    assert isinstance(data["rabbitmq"], bool)


@pytest.mark.asyncio
async def test_prometheus_metrics_endpoint(client: AsyncClient):
    """GET /metrics must expose Prometheus metrics."""
    res = await client.get("/metrics")
    assert res.status_code == 200
    assert "http_requests" in res.text or "process_virtual_memory" in res.text or "python_gc" in res.text
