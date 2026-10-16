"""
app/clients/identity_client.py
────────────────────────────────
Abstraction over the Identity service's user-profile API.

Design:
  IdentityClientProtocol – structural Protocol (duck-typed).
  HttpIdentityClient     – real implementation for staging/production.
  MockIdentityClient     – deterministic mock for development & CI.

Switch via env var:  USE_MOCK_IDENTITY=true  (default in .env.example)

When the real Identity service is available:
  GET {IDENTITY_SERVICE_URL}/api/users/{user_id}
  Expected JSON shape: { user_id, display_name, average_rating, total_bookings, is_verified }
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Protocol
from uuid import UUID

import httpx

from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

_RETRY_ATTEMPTS = 3
_RETRY_BASE_DELAY = 0.5  # seconds


@dataclass
class UserProfile:
    """Minimal user data needed by the Babysitting service."""
    user_id: UUID
    display_name: str
    average_rating: float      # 0.0 if not yet rated
    total_bookings: int
    is_verified: bool


class IdentityClientProtocol(Protocol):
    async def get_user(self, user_id: UUID) -> UserProfile | None:
        """Return user profile or None if not found."""
        ...

    async def get_users_batch(self, user_ids: list[UUID]) -> dict[UUID, UserProfile]:
        """Return a mapping of user_id → UserProfile for all found users."""
        ...


class HttpIdentityClient:
    """
    Calls the real Identity service over HTTP.
    Implements exponential-backoff retry (max 3 attempts) on transient errors.
    """

    def __init__(self) -> None:
        self._base_url = settings.IDENTITY_SERVICE_URL.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=5.0,
            headers={"Accept": "application/json"},
        )

    async def get_user(self, user_id: UUID) -> UserProfile | None:
        url = f"/api/users/{user_id}"
        for attempt in range(_RETRY_ATTEMPTS):
            try:
                resp = await self._client.get(url)
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                data = resp.json()
                return UserProfile(
                    user_id=UUID(data["user_id"]),
                    display_name=data["display_name"],
                    average_rating=float(data.get("average_rating", 0.0)),
                    total_bookings=int(data.get("total_bookings", 0)),
                    is_verified=bool(data.get("is_verified", False)),
                )
            except httpx.TransportError as exc:
                if attempt == _RETRY_ATTEMPTS - 1:
                    logger.error(
                        "identity_client_failed",
                        user_id=str(user_id),
                        error=str(exc),
                        attempt=attempt + 1,
                    )
                    raise
                delay = _RETRY_BASE_DELAY * (2**attempt)
                logger.warning(
                    "identity_client_retry",
                    user_id=str(user_id),
                    attempt=attempt + 1,
                    delay=delay,
                )
                await asyncio.sleep(delay)
        return None  # unreachable but satisfies type checker

    async def get_users_batch(self, user_ids: list[UUID]) -> dict[UUID, UserProfile]:
        results: dict[UUID, UserProfile] = {}
        # Fetch concurrently – the Identity service should handle fan-out
        tasks = [self.get_user(uid) for uid in user_ids]
        profiles = await asyncio.gather(*tasks, return_exceptions=False)
        for uid, profile in zip(user_ids, profiles):
            if profile is not None:
                results[uid] = profile
        return results

    async def aclose(self) -> None:
        await self._client.aclose()


class MockIdentityClient:
    """
    Deterministic mock – no network calls.
    Returns realistic-looking data derived from the user_id.
    Suitable for local development and CI pipelines.
    """

    _NAMES = [
        "Alice Martin", "Bob Dupont", "Clara Schmidt", "David López",
        "Emma Wilson", "François Leroy", "Grace Kim", "Hamid Rahimi",
        "Isabelle Blanc", "James O'Brien",
    ]

    def _make_profile(self, user_id: UUID) -> UserProfile:
        # Derive deterministic values from the UUID integer so the same
        # user_id always returns the same mock profile.
        uid_int = user_id.int
        name_index = uid_int % len(self._NAMES)
        return UserProfile(
            user_id=user_id,
            display_name=self._NAMES[name_index],
            average_rating=round(3.0 + (uid_int % 20) / 10, 1),  # 3.0–4.9
            total_bookings=(uid_int % 50),
            is_verified=(uid_int % 3 != 0),  # ~66 % are verified
        )

    async def get_user(self, user_id: UUID) -> UserProfile | None:
        logger.debug("mock_identity_get_user", user_id=str(user_id))
        return self._make_profile(user_id)

    async def get_users_batch(self, user_ids: list[UUID]) -> dict[UUID, UserProfile]:
        return {uid: self._make_profile(uid) for uid in user_ids}


def get_identity_client() -> IdentityClientProtocol:
    """
    Factory: returns MockIdentityClient when USE_MOCK_IDENTITY=true,
    otherwise HttpIdentityClient.
    """
    if settings.USE_MOCK_IDENTITY:
        logger.info("identity_client_mode", mode="mock")
        return MockIdentityClient()
    logger.info(
        "identity_client_mode", mode="http", base_url=settings.IDENTITY_SERVICE_URL
    )
    return HttpIdentityClient()
