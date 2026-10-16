"""
app/events/publisher.py
────────────────────────
Event publishing abstraction for cross-service communication.

Current implementation: Redis Streams (XADD) + Pub/Sub
Planned Sprint 4:       RabbitMQ – just implement EventPublisher with
                        a new RabbitMQEventPublisher class; nothing else changes.

Stream key: babysitting:events:booking_accepted
Channel:    babysitting:pubsub:booking_accepted

The stream provides durability (messages survive restarts); the Pub/Sub
channel provides low-latency delivery for consumers that can afford to
miss messages produced while they were offline.

Event contract for BookingAccepted:
{
  "event_type": "BookingAccepted",
  "schema_version": "1.0",
  "booking_id": "<uuid>",
  "requester_id": "<uuid>",
  "babysitter_id": "<uuid>",
  "scheduled_date": "YYYY-MM-DD",
  "start_time": "HH:MM:SS",
  "end_time": "HH:MM:SS",
  "neighborhood": "<str>",
  "published_at": "<ISO8601>"
}
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Stream / channel names – keep stable; consuming services subscribe to these.
BOOKING_ACCEPTED_STREAM = "babysitting:events:booking_accepted"
BOOKING_ACCEPTED_CHANNEL = "babysitting:pubsub:booking_accepted"


# ── Event dataclass ──────────────────────────────────────────────────────────

@dataclass
class BookingAcceptedEvent:
    booking_id: UUID
    requester_id: UUID
    babysitter_id: UUID
    scheduled_date: date
    start_time: time
    end_time: time
    neighborhood: str
    event_type: str = field(default="BookingAccepted", init=False)
    schema_version: str = field(default="1.0", init=False)
    published_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc), init=False
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_type": self.event_type,
            "schema_version": self.schema_version,
            "booking_id": str(self.booking_id),
            "requester_id": str(self.requester_id),
            "babysitter_id": str(self.babysitter_id),
            "scheduled_date": self.scheduled_date.isoformat(),
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat(),
            "neighborhood": self.neighborhood,
            "published_at": self.published_at.isoformat(),
        }


# ── Abstract base ────────────────────────────────────────────────────────────

class EventPublisher(ABC):
    """
    Contract for all event publishers.
    Swap implementations by changing the factory below – no caller code changes.
    """

    @abstractmethod
    async def publish_booking_accepted(self, event: BookingAcceptedEvent) -> None: ...

    @abstractmethod
    async def publish(self, channel: str, event_data: dict) -> None: ...


# ── Redis implementation ──────────────────────────────────────────────────────

class RedisEventPublisher(EventPublisher):
    """
    Publishes events to a Redis Stream (durable) and Pub/Sub (real-time).
    To replace with RabbitMQ: implement EventPublisher with an AMQP client
    and update get_event_publisher() – no other changes needed.
    """

    def __init__(self, redis_client: Any) -> None:
        # redis_client is the raw redis.asyncio.Redis instance from RedisClient._redis
        self._redis = redis_client

    async def publish_booking_accepted(self, event: BookingAcceptedEvent) -> None:
        payload = event.to_dict()
        await self.publish(BOOKING_ACCEPTED_STREAM, payload)

    async def publish(self, channel: str, event_data: dict) -> None:
        json_payload = json.dumps(event_data, default=str)
        try:
            # 1. Append to stream for durability (consumers use XREAD/XREADGROUP)
            stream_id = await self._redis.xadd(
                channel, {"data": json_payload}, maxlen=10_000, approximate=True
            )
            # 2. Publish to Pub/Sub for immediate in-memory consumers
            pubsub_channel = channel.replace(":events:", ":pubsub:")
            await self._redis.publish(pubsub_channel, json_payload)
            logger.info(
                "event_published",
                channel=channel,
                stream_id=stream_id,
                event_type=event_data.get("event_type"),
            )
        except Exception as exc:
            # Do NOT let event publishing failures abort the main transaction.
            # Log and continue – add a retry queue or outbox pattern in Sprint 4.
            logger.error("event_publish_failed", channel=channel, error=str(exc))


# ── No-op implementation (tests) ─────────────────────────────────────────────

class NoOpEventPublisher(EventPublisher):
    """Logs events but does not actually publish. Used in test environment."""

    async def publish_booking_accepted(self, event: BookingAcceptedEvent) -> None:
        logger.info("noop_event_published", event=event.to_dict())

    async def publish(self, channel: str, event_data: dict) -> None:
        logger.info("noop_event_published", channel=channel, event=event_data)


# ── Factory ──────────────────────────────────────────────────────────────────

def get_event_publisher(redis_client: Any) -> EventPublisher:
    """
    Return the appropriate EventPublisher.
    - test environment  → NoOpEventPublisher (no Redis required)
    - all other envs    → RedisEventPublisher

    Sprint 4 migration:
        Replace RedisEventPublisher with RabbitMQEventPublisher here.
        The rest of the codebase remains unchanged.
    """
    if settings.is_test:
        return NoOpEventPublisher()
    return RedisEventPublisher(redis_client)
