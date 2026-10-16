import json
from unittest.mock import AsyncMock, MagicMock
import pytest
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.events.consumer import event_consumer
from app.events.publisher import event_publisher


class MockMessage:
    """Mock aio_pika IncomingMessage for unit testing consumer handlers."""

    def __init__(self, payload: dict):
        self.body = json.dumps(payload).encode("utf-8")

    def process(self, *args, **kwargs):
        class ProcessContext:
            async def __aenter__(self):
                return self
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        return ProcessContext()


@pytest.mark.asyncio
async def test_consumer_user_registered_creates_entry_without_location(test_db: AsyncIOMotorDatabase):
    """
    Consumer processing identity.user_registered:
    - Inserts event_id into processed_events
    - Creates user_locations entry with verified=False
    - MUST NOT contain 'location' field (to avoid 2dsphere partial index constraint violation)
    """
    event_payload = {
        "event_id": "evt-unique-123",
        "type": "identity.user_registered",
        "version": 1,
        "occurred_at": "2026-10-15T12:00:00Z",
        "data": {
            "user_id": "usr_event_newbie"
        }
    }

    mock_msg = MockMessage(event_payload)
    await event_consumer._process_message(mock_msg)

    # Verify user_locations entry
    doc = await test_db.user_locations.find_one({"user_id": "usr_event_newbie"})
    assert doc is not None
    assert doc["user_id"] == "usr_event_newbie"
    assert doc["verified"] is False
    # Crucial rule: location field must NOT exist yet!
    assert "location" not in doc

    # Verify processed_events entry
    evt_doc = await test_db.processed_events.find_one({"_id": "evt-unique-123"})
    assert evt_doc is not None
    assert evt_doc["type"] == "identity.user_registered"


@pytest.mark.asyncio
async def test_consumer_idempotence_duplicate_event_ignored(test_db: AsyncIOMotorDatabase):
    """Sending the exact same event twice must be idempotent and ignored without error."""
    event_payload = {
        "event_id": "evt-duplicate-456",
        "type": "identity.user_registered",
        "version": 1,
        "occurred_at": "2026-10-15T12:00:00Z",
        "data": {
            "user_id": "usr_event_duplicate"
        }
    }

    mock_msg1 = MockMessage(event_payload)
    mock_msg2 = MockMessage(event_payload)

    # First call: processes normally
    await event_consumer._process_message(mock_msg1)
    count_first = await test_db.processed_events.count_documents({"_id": "evt-duplicate-456"})
    assert count_first == 1

    # Second call with same event_id: idempotent ignore
    await event_consumer._process_message(mock_msg2)
    count_second = await test_db.processed_events.count_documents({"_id": "evt-duplicate-456"})
    assert count_second == 1


@pytest.mark.asyncio
async def test_publisher_handles_offline_broker_gracefully():
    """Publisher should safely return False when broker is offline without throwing unhandled exceptions."""
    # Ensure publisher state is offline
    event_publisher.is_connected = False
    event_publisher.exchange = None

    success = await event_publisher.publish_event(
        routing_key="geo.neighbor_joined",
        data={"user_id": "u1", "neighborhood_id": "nh1"}
    )
    assert success is False
