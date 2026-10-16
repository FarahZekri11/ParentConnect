import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Optional
import aio_pika
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.database import db_manager

logger = logging.getLogger(__name__)


class EventConsumer:
    """RabbitMQ consumer handling inbound domain events with idempotence and dead-letter queues."""

    def __init__(self) -> None:
        self.connection: Optional[aio_pika.RobustConnection] = None
        self.channel: Optional[aio_pika.RobustChannel] = None
        self.queue: Optional[aio_pika.RobustQueue] = None
        self.is_running: bool = False
        self._consumer_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start consumer background loop."""
        self.is_running = True
        self._consumer_task = asyncio.create_task(self._run_consumer())

    async def _run_consumer(self) -> None:
        """Establish connection, declare DLQ, queue, exchange, and consume messages."""
        while self.is_running:
            try:
                logger.info("Initializing RabbitMQ consumer...")
                self.connection = await aio_pika.connect_robust(
                    settings.RABBITMQ_URL,
                    timeout=5.0
                )
                self.channel = await self.connection.channel()
                await self.channel.set_qos(prefetch_count=10)

                # 1. Declare dead-letter exchange and DLQ
                dlx = await self.channel.declare_exchange(
                    "parentconnect.dlx",
                    type=aio_pika.ExchangeType.DIRECT,
                    durable=True
                )
                dlq = await self.channel.declare_queue(
                    settings.RABBITMQ_DLQ,
                    durable=True
                )
                await dlq.bind(dlx, routing_key="geo.dead_letter")

                # 2. Declare main topic exchange
                exchange = await self.channel.declare_exchange(
                    settings.RABBITMQ_EXCHANGE,
                    type=aio_pika.ExchangeType.TOPIC,
                    durable=True
                )

                # 3. Declare consumer queue with DLX routing arguments
                queue_args = {
                    "x-dead-letter-exchange": "parentconnect.dlx",
                    "x-dead-letter-routing-key": "geo.dead_letter"
                }
                self.queue = await self.channel.declare_queue(
                    settings.RABBITMQ_USER_REGISTERED_QUEUE,
                    durable=True,
                    arguments=queue_args
                )

                # Bind to identity.user_registered
                await self.queue.bind(exchange, routing_key="identity.user_registered")
                logger.info(f"Consumer bound to {settings.RABBITMQ_EXCHANGE} on identity.user_registered")

                # 4. Consume messages
                async with self.queue.iterator() as queue_iter:
                    async for message in queue_iter:
                        if not self.is_running:
                            break
                        await self._process_message(message)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"RabbitMQ consumer connection lost: {e}. Retrying in 5 seconds...")
                await asyncio.sleep(5.0)

    async def _process_message(self, message: aio_pika.IncomingMessage) -> None:
        """
        Process single incoming message idempotently.
        Inserts event_id into processed_events collection first.
        """
        async with message.process(requeue=False, reject_on_redelivered_error=False):
            try:
                payload = json.loads(message.body.decode("utf-8"))
                event_id = payload.get("event_id")
                event_type = payload.get("type")
                data = payload.get("data", {})

                if not event_id:
                    logger.warning("Received event without event_id, skipping.")
                    return

                db = db_manager.db
                if db is None:
                    logger.error("Database not available during event processing.")
                    raise RuntimeError("Database unavailable")

                # Idempotency check: insert into processed_events
                try:
                    await db.processed_events.insert_one({
                        "_id": event_id,
                        "type": event_type,
                        "processed_at": datetime.now(timezone.utc)
                    })
                except DuplicateKeyError:
                    logger.info(f"Idempotent: Event {event_id} already processed. Ignoring.")
                    return

                # Handle specific domain event
                if event_type == "identity.user_registered":
                    user_id = data.get("user_id")
                    if user_id:
                        await self._handle_user_registered(db, user_id)
                    else:
                        logger.warning(f"UserRegistered event missing user_id: {data}")

            except Exception as e:
                logger.error(f"Error processing message: {e}", exc_info=True)
                raise e

    async def _handle_user_registered(self, db: AsyncIOMotorDatabase, user_id: str) -> None:
        """
        Create default initial user_locations entry WITHOUT location field
        (to respect 2dsphere partial index constraint).
        """
        now = datetime.now(timezone.utc)
        await db.user_locations.update_one(
            {"user_id": user_id},
            {
                "$setOnInsert": {
                    "user_id": user_id,
                    "verified": False,
                    "precision_m": settings.LOCATION_BLUR_M,
                    "updated_at": now
                }
            },
            upsert=True
        )
        logger.info(f"Initialized user_locations for user {user_id} without location field")

    async def stop(self) -> None:
        """Gracefully terminate consumer task and close connection."""
        self.is_running = False
        if self._consumer_task and not self._consumer_task.done():
            self._consumer_task.cancel()
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
            logger.info("RabbitMQ consumer closed.")


event_consumer = EventConsumer()
