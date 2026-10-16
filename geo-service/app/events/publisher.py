import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, Optional
import uuid
import aio_pika
from app.config import settings

logger = logging.getLogger(__name__)


class EventPublisher:
    """RabbitMQ event publisher using aio-pika with robust reconnection."""

    def __init__(self) -> None:
        self.connection: Optional[aio_pika.RobustConnection] = None
        self.channel: Optional[aio_pika.RobustChannel] = None
        self.exchange: Optional[aio_pika.RobustExchange] = None
        self.is_connected: bool = False
        self._reconnect_task: Optional[asyncio.Task] = None

    async def connect(self) -> None:
        """Establish robust connection and declare topic exchange."""
        try:
            logger.info(f"Connecting to RabbitMQ at {settings.RABBITMQ_URL.split('@')[-1] if '@' in settings.RABBITMQ_URL else settings.RABBITMQ_URL}")
            self.connection = await aio_pika.connect_robust(
                settings.RABBITMQ_URL,
                timeout=5.0
            )
            self.channel = await self.connection.channel()
            # Declare durable topic exchange parentconnect.events
            self.exchange = await self.channel.declare_exchange(
                name=settings.RABBITMQ_EXCHANGE,
                type=aio_pika.ExchangeType.TOPIC,
                durable=True
            )
            self.is_connected = True
            logger.info("RabbitMQ publisher connected successfully.")
        except Exception as e:
            self.is_connected = False
            logger.warning(f"RabbitMQ connection failed: {e}. Retrying in background...")

    async def start_background_reconnect(self) -> None:
        """Start background loop attempting to connect to RabbitMQ without blocking service startup."""
        await self.connect()
        if not self.is_connected:
            self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self) -> None:
        """Periodic background task to reconnect if RabbitMQ becomes available."""
        while not self.is_connected:
            try:
                await asyncio.sleep(5.0)
                await self.connect()
                if self.is_connected:
                    logger.info("RabbitMQ successfully connected via background retry.")
                    break
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug(f"RabbitMQ background reconnection retry failed: {e}")

    async def close(self) -> None:
        """Close RabbitMQ publisher channel and connection."""
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
            logger.info("RabbitMQ publisher closed.")
        self.is_connected = False

    async def publish_event(self, routing_key: str, data: Dict[str, Any]) -> bool:
        """
        Publish persistent event with standardized envelope:
        {
          "event_id": str(uuid4),
          "type": routing_key,
          "version": 1,
          "occurred_at": ISO8601 UTC,
          "data": data
        }
        """
        envelope = {
            "event_id": str(uuid.uuid4()),
            "type": routing_key,
            "version": 1,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "data": data
        }

        if not self.is_connected or self.exchange is None:
            logger.warning(
                f"RabbitMQ not connected. Event {routing_key} ({envelope['event_id']}) queued/dropped."
            )
            return False

        try:
            body = json.dumps(envelope).encode("utf-8")
            message = aio_pika.Message(
                body=body,
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                content_type="application/json"
            )
            await self.exchange.publish(message, routing_key=routing_key)
            logger.info(f"Published event [{routing_key}] with ID {envelope['event_id']}")
            return True
        except Exception as e:
            logger.error(f"Failed to publish event [{routing_key}]: {e}")
            return False


event_publisher = EventPublisher()
