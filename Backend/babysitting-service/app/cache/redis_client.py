"""
app/cache/redis_client.py
──────────────────────────
Thin async Redis wrapper with domain-specific methods.

Key naming convention (all prefixed with service namespace):
  babysitting:avail:{user_id}          – availability list for a user
  babysitting:match:{request_id}       – match results for a request
  babysitting:lock:slot:{avail_id}     – ephemeral booking lock
  babysitting:ratelimit:{user_id}:{action} – sliding window rate limiter

TTL defaults come from settings.CACHE_TTL_SECONDS.
"""
from __future__ import annotations

import json
from uuid import UUID

from redis.asyncio import Redis, from_url

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Key prefixes – centralised so they're easy to audit / change
_PFX = "babysitting"
_AVAIL_PFX = f"{_PFX}:avail"
_MATCH_PFX = f"{_PFX}:match"
_LOCK_PFX = f"{_PFX}:lock:slot"
_RL_PFX = f"{_PFX}:ratelimit"


class RedisClient:
    def __init__(self, url: str) -> None:
        self._redis: Redis = from_url(url, decode_responses=True)

    # ── Availability list cache ──────────────────────────────────────────────

    def _avail_key(self, user_id: UUID) -> str:
        return f"{_AVAIL_PFX}:{user_id}"

    async def get_availability_list(self, user_id: UUID) -> list | None:
        raw = await self._redis.get(self._avail_key(user_id))
        if raw is None:
            return None
        return json.loads(raw)

    async def set_availability_list(
        self, user_id: UUID, data: list, ttl: int | None = None
    ) -> None:
        key = self._avail_key(user_id)
        ttl = ttl or settings.CACHE_TTL_SECONDS
        await self._redis.set(key, json.dumps(data, default=str), ex=ttl)
        logger.debug("cache_set", key=key, ttl=ttl)

    async def invalidate_availability(self, user_id: UUID) -> None:
        key = self._avail_key(user_id)
        await self._redis.delete(key)
        logger.debug("cache_invalidated", key=key)

    # ── Match result cache ───────────────────────────────────────────────────

    def _match_key(self, request_id: UUID) -> str:
        return f"{_MATCH_PFX}:{request_id}"

    async def get_match_results(self, request_id: UUID) -> list | None:
        raw = await self._redis.get(self._match_key(request_id))
        if raw is None:
            return None
        return json.loads(raw)

    async def set_match_results(
        self, request_id: UUID, data: list, ttl: int | None = None
    ) -> None:
        key = self._match_key(request_id)
        ttl = ttl or settings.CACHE_TTL_SECONDS
        await self._redis.set(key, json.dumps(data, default=str), ex=ttl)
        logger.debug("cache_set", key=key, ttl=ttl)

    async def invalidate_match_results(self, request_id: UUID) -> None:
        key = self._match_key(request_id)
        await self._redis.delete(key)
        logger.debug("cache_invalidated", key=key)

    # ── Slot locking (prevents double-booking race) ──────────────────────────

    def _lock_key(self, availability_id: UUID) -> str:
        return f"{_LOCK_PFX}:{availability_id}"

    async def acquire_slot_lock(
        self, availability_id: UUID, booking_user_id: UUID, ttl_seconds: int = 30
    ) -> bool:
        """
        Attempt to acquire an exclusive lock on an availability slot.
        Uses SET NX EX which is atomic – safe under concurrent requests.

        Returns True if the lock was acquired, False if already locked.
        """
        key = self._lock_key(availability_id)
        acquired = await self._redis.set(
            key, str(booking_user_id), nx=True, ex=ttl_seconds
        )
        if acquired:
            logger.debug("slot_lock_acquired", avail_id=str(availability_id), ttl=ttl_seconds)
        else:
            logger.warning("slot_lock_failed", avail_id=str(availability_id))
        return bool(acquired)

    async def release_slot_lock(self, availability_id: UUID) -> None:
        key = self._lock_key(availability_id)
        await self._redis.delete(key)
        logger.debug("slot_lock_released", avail_id=str(availability_id))

    async def is_slot_locked(self, availability_id: UUID) -> bool:
        return bool(await self._redis.exists(self._lock_key(availability_id)))

    # ── Rate limiting (sliding window counter) ───────────────────────────────

    def _rl_key(self, user_id: UUID, action: str) -> str:
        return f"{_RL_PFX}:{user_id}:{action}"

    async def check_rate_limit(
        self,
        user_id: UUID,
        action: str,
        max_requests: int,
        window_seconds: int,
    ) -> bool:
        """
        Increment and check a sliding-window counter.
        Returns True if within limit, False if the limit was exceeded.
        Uses a pipeline for atomicity.
        """
        key = self._rl_key(user_id, action)
        pipe = self._redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds)
        results = await pipe.execute()
        current = int(results[0])
        if current > max_requests:
            logger.warning(
                "rate_limit_exceeded",
                user_id=str(user_id),
                action=action,
                count=current,
                max=max_requests,
            )
            return False
        return True

    # ── Health ───────────────────────────────────────────────────────────────

    async def ping(self) -> bool:
        try:
            return await self._redis.ping()  # type: ignore[return-value]
        except Exception:
            return False

    async def close(self) -> None:
        await self._redis.aclose()


# ── Singleton instance (created at startup) ───────────────────────────────────
# Initialised in app/main.py lifespan and injected via dependency.
_redis_client: RedisClient | None = None


def get_redis_client() -> RedisClient:
    if _redis_client is None:
        raise RuntimeError("Redis client not initialised – call init_redis() first")
    return _redis_client


def set_redis_client(client: RedisClient) -> None:
    """Called from main.py lifespan to inject the global client."""
    global _redis_client
    _redis_client = client
