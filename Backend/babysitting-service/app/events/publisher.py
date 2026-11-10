"""
app/events/publisher.py
────────────────────────
Event publishing abstraction for cross-service asynchronous communication.

RabbitMQ Integration (Team Standard):
  - Broker Host:     ${RABBITMQ_HOST:-rabbitmq}:5672
  - Shared Exchange: parentconnect.topic (Topic Exchange, durable)
  - Routing Keys:    babysitting.<entity>.<action> (e.g. babysitting.booking.accepted)
  - Dedicated Queue: babysitting_events_queue (durable, bound to babysitting.#)

Fallback / Test Modes:
  - RedisEventPublisher: Redis Stream + Pub/Sub fallback
  - NoOpEventPublisher:  used in unit/integration tests
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
import json
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

try:
    import aio_pika
    AIO_PIKA_AVAILABLE = True
except ImportError:
    aio_pika = None  # type: ignore[assignment]
    AIO_PIKA_AVAILABLE = False


# ── Domain Event Models ───────────────────────────────────────────────────────

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


# ── Abstract Base Publisher ──────────────────────────────────────────────────

class EventPublisher(ABC):
    """Abstract contract for event publishing."""

    @abstractmethod
    async def publish_booking_accepted(self, event: BookingAcceptedEvent) -> None:
        ...

    @abstractmethod
    async def publish(self, routing_key: str, event_data: dict[str, Any]) -> None:
        ...


# ── RabbitMQ Publisher (Primary) ──────────────────────────────────────────────

class RabbitMQEventPublisher(EventPublisher):
    """
    Asynchronous RabbitMQ publisher using AMQP 0-9-1 Topic Exchange.
    Publishes to 'parentconnect.topic' exchange with routing keys
    following the format 'babysitting.<entity>.<action>'.
    """

    def __init__(self) -> None:
        self._connection: Any = None
        self._channel: Any = None
        self._exchange: Any = None

    async def _get_channel(self) -> Any:
        if self._channel is not None and not self._channel.is_closed:
            return self._channel

        if not AIO_PIKA_AVAILABLE:
            logger.warning("aio_pika_not_installed", action="skipping_rabbitmq_publish")
            return None

        current_settings = get_settings()
        vhost = current_settings.RABBITMQ_VHOST.lstrip("/")
        vhost_str = f"/{vhost}" if vhost else "/"
        url = (
            f"amqp://{current_settings.RABBITMQ_USER}:{current_settings.RABBITMQ_PASSWORD}"
            f"@{current_settings.RABBITMQ_HOST}:{current_settings.RABBITMQ_PORT}{vhost_str}"
        )

        try:
            self._connection = await aio_pika.connect_robust(url)
            self._channel = await self._connection.channel()

            # Declare durable shared topic exchange
            self._exchange = await self._channel.declare_exchange(
                name=current_settings.RABBITMQ_EXCHANGE,
                type=aio_pika.ExchangeType.TOPIC,
                durable=True,
            )

            # Declare dedicated queue for babysitting service
            queue = await self._channel.declare_queue(
                name=current_settings.RABBITMQ_QUEUE,
                durable=True,
            )

            # Bind queue to exchange on babysitting routing pattern
            await queue.bind(self._exchange, routing_key="babysitting.#")

            logger.info(
                "rabbitmq_channel_initialized",
                exchange=current_settings.RABBITMQ_EXCHANGE,
                queue=current_settings.RABBITMQ_QUEUE,
            )
            return self._channel
        except Exception as exc:
            logger.warning("rabbitmq_connect_failed", error=str(exc))
            return None

    async def publish(self, routing_key: str, event_data: dict[str, Any]) -> None:
        # Normalize routing key prefix if needed
        if not routing_key.startswith("babysitting."):
            routing_key = f"babysitting.{routing_key}"

        payload_bytes = json.dumps(event_data, default=str).encode("utf-8")

        try:
            channel = await self._get_channel()
            if channel and self._exchange:
                message = aio_pika.Message(
                    body=payload_bytes,
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    headers={"service": "babysitting-service"},
                )
                await self._exchange.publish(message, routing_key=routing_key)
                logger.info(
                    "rabbitmq_event_published",
                    routing_key=routing_key,
                    event_type=event_data.get("event_type"),
                )
            else:
                logger.info(
                    "rabbitmq_skipped",
                    routing_key=routing_key,
                    reason="broker_not_connected",
                )
        except Exception as exc:
            logger.error("rabbitmq_publish_error", routing_key=routing_key, error=str(exc))

    async def publish_booking_accepted(self, event: BookingAcceptedEvent) -> None:
        await self.publish("babysitting.booking.accepted", event.to_dict())

    async def close(self) -> None:
        try:
            if self._connection and not self._connection.is_closed:
                await self._connection.close()
        except Exception as exc:
            logger.debug("rabbitmq_close_error", error=str(exc))


# ── Redis Publisher (Fallback) ────────────────────────────────────────────────

class RedisEventPublisher(EventPublisher):
    """Fallback publisher using Redis Stream and Pub/Sub."""

    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client

    async def publish(self, routing_key: str, event_data: dict[str, Any]) -> None:
        channel = f"babysitting:events:{routing_key.replace('.', ':')}"
        json_payload = json.dumps(event_data, default=str)
        try:
            if hasattr(self._redis, "xadd"):
                await self._redis.xadd(channel, {"data": json_payload}, maxlen=10_000, approximate=True)
            if hasattr(self._redis, "publish"):
                pubsub_channel = channel.replace(":events:", ":pubsub:")
                await self._redis.publish(pubsub_channel, json_payload)
            logger.info("redis_event_published", channel=channel, event_type=event_data.get("event_type"))
        except Exception as exc:
            logger.error("redis_event_publish_failed", channel=channel, error=str(exc))

    async def publish_booking_accepted(self, event: BookingAcceptedEvent) -> None:
        await self.publish("booking.accepted", event.to_dict())


# ── No-Op Publisher (Test Mode) ───────────────────────────────────────────────

class NoOpEventPublisher(EventPublisher):
    """No-op publisher for testing without broker dependencies."""

    async def publish(self, routing_key: str, event_data: dict[str, Any]) -> None:
        logger.debug("noop_event_published", routing_key=routing_key, event=event_data)

    async def publish_booking_accepted(self, event: BookingAcceptedEvent) -> None:
        logger.debug("noop_booking_accepted", event=event.to_dict())


# ── Singleton & Factory ───────────────────────────────────────────────────────

_rabbitmq_instance: RabbitMQEventPublisher | None = None


def get_rabbitmq_publisher() -> RabbitMQEventPublisher:
    global _rabbitmq_instance
    if _rabbitmq_instance is None:
        _rabbitmq_instance = RabbitMQEventPublisher()
    return _rabbitmq_instance


async def close_rabbitmq_publisher() -> None:
    global _rabbitmq_instance
    if _rabbitmq_instance is not None:
        await _rabbitmq_instance.close()
        _rabbitmq_instance = None


def get_event_publisher(redis_client: Any = None) -> EventPublisher:
    """
    Factory function returning the active event publisher.
      - Test environment  -> NoOpEventPublisher
      - RabbitMQ enabled  -> RabbitMQEventPublisher
      - Redis client given -> RedisEventPublisher
      - Default fallback  -> NoOpEventPublisher
    """
    current_settings = get_settings()
    if current_settings.is_test:
        return NoOpEventPublisher()

    if current_settings.RABBITMQ_ENABLED:
        return get_rabbitmq_publisher()

    if redis_client:
        raw_redis = getattr(redis_client, "_redis", redis_client)
        return RedisEventPublisher(raw_redis)

    return NoOpEventPublisher()
