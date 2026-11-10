"""
app/security/dependencies.py
─────────────────────────────
FastAPI dependencies for authentication and authorization.

Supports two complementary authentication modes:
  1. Gateway Relay Mode (Performance & Defense in Depth):
     If the incoming request has 'X-Gateway-Auth: verified', trust the identity
     propagated by the central API Gateway via 'X-User-Id' and 'X-User-Role'
     without re-verifying the JWT signature.

  2. Direct Mode (JWT Bearer):
     Validates Keycloak JWT (RS256) signature against KEYCLOAK_REALM_PUBLIC_KEY
     (or local secret in dev/test).
     Extracts user ID ('sub' / 'preferred_username') and role ('realm_access.roles').

HTTP Error Codes:
  - 401 Unauthorized: token missing, invalid, or expired.
  - 403 Forbidden: user does not have the required role.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.security.jwt import parse_user_id, verify_token

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/token",
    scheme_name="JWT",
    auto_error=False,
)


@dataclass
class UserContext:
    """Authenticated user context propagated through request lifecycle."""
    user_id: UUID
    role: str
    roles: list[str] = field(default_factory=list)
    raw_user_id: str = ""
    token: str | None = None


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
) -> UserContext:
    """
    Extract and validate authenticated user identity.

    Checks for Gateway Relay headers first ('X-Gateway-Auth: verified').
    If absent, falls back to direct Bearer JWT validation.
    """
    # ── 1. Gateway Relay Mode ──────────────────────────────────────────────────
    gateway_auth = request.headers.get("X-Gateway-Auth", "").strip().lower()
    if gateway_auth == "verified":
        raw_user_id = request.headers.get("X-User-Id")
        if not raw_user_id:
            raise UnauthorizedError("Missing X-User-Id header from verified gateway")

        raw_role = request.headers.get("X-User-Role", "PARENT")
        roles = [r.strip().upper() for r in raw_role.split(",") if r.strip()]
        primary_role = roles[0] if roles else "PARENT"

        # Propagate received Bearer token if present
        auth_header = request.headers.get("Authorization", "")
        extracted_token = (
            auth_header.removeprefix("Bearer ").strip()
            if auth_header.startswith("Bearer ")
            else token
        )

        user_id = parse_user_id(raw_user_id)
        return UserContext(
            user_id=user_id,
            role=primary_role,
            roles=roles,
            raw_user_id=raw_user_id,
            token=extracted_token,
        )

    # ── 2. Direct Mode (JWT Bearer) ───────────────────────────────────────────
    if token is None:
        # Check raw Authorization header as fallback
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ").strip()

    if not token:
        raise UnauthorizedError("Authorization header with Bearer token is required")

    payload = verify_token(token)
    raw_user_id = str(payload.get("sub") or payload.get("preferred_username") or "")
    user_id = parse_user_id(raw_user_id)
    roles = [str(r).upper() for r in payload.get("roles", [])]
    primary_role = str(payload.get("role", "PARENT")).upper()

    return UserContext(
        user_id=user_id,
        role=primary_role,
        roles=roles,
        raw_user_id=raw_user_id,
        token=token,
    )


async def optional_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
) -> UserContext | None:
    """
    Optional authentication for endpoints accessible anonymously.
    Returns UserContext if authenticated, None otherwise.
    """
    # Check Gateway Relay first
    gateway_auth = request.headers.get("X-Gateway-Auth", "").strip().lower()
    if gateway_auth == "verified":
        raw_user_id = request.headers.get("X-User-Id")
        if raw_user_id:
            raw_role = request.headers.get("X-User-Role", "PARENT")
            roles = [r.strip().upper() for r in raw_role.split(",") if r.strip()]
            primary_role = roles[0] if roles else "PARENT"
            auth_header = request.headers.get("Authorization", "")
            extracted_token = (
                auth_header.removeprefix("Bearer ").strip()
                if auth_header.startswith("Bearer ")
                else token
            )
            return UserContext(
                user_id=parse_user_id(raw_user_id),
                role=primary_role,
                roles=roles,
                raw_user_id=raw_user_id,
                token=extracted_token,
            )

    if token is None:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ").strip()

    if not token:
        return None

    try:
        payload = verify_token(token)
        raw_user_id = str(payload.get("sub") or payload.get("preferred_username") or "")
        return UserContext(
            user_id=parse_user_id(raw_user_id),
            role=str(payload.get("role", "PARENT")).upper(),
            roles=[str(r).upper() for r in payload.get("roles", [])],
            raw_user_id=raw_user_id,
            token=token,
        )
    except UnauthorizedError:
        return None


def require_role(*allowed_roles: str) -> Callable:
    """
    Dependency factory enforcing role-based access control.
    Accepts roles such as 'ADMIN', 'PARENT', 'PROFESSIONAL'.
    Returns 403 Forbidden if user lacks required role.
    """
    allowed_normalized = {r.upper() for r in allowed_roles}
    # Map equivalent roles across team vocabulary
    if "PROFESSIONAL" in allowed_normalized:
        allowed_normalized.add("BABYSITTER")
    if "BABYSITTER" in allowed_normalized:
        allowed_normalized.add("PROFESSIONAL")

    async def _check_role(
        user: UserContext = Depends(get_current_user),
    ) -> UserContext:
        user_roles = {r.upper() for r in user.roles} | {user.role.upper()}
        if not user_roles.intersection(allowed_normalized):
            raise ForbiddenError(
                f"Role '{user.role}' is not permitted. Required: {list(allowed_roles)}"
            )
        return user

    return _check_role
