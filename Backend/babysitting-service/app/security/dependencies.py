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
from urllib.parse import unquote_plus
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
    # Nom affiché (claim Keycloak "name", transmis par la Gateway en X-User-Display-Name)
    display_name: str = ""

    def has_any_role(self, *wanted: str) -> bool:
        owned = {r.upper() for r in self.roles} | {self.role.upper()}
        return any(w.upper() in owned for w in wanted)

    @property
    def is_admin(self) -> bool:
        return self.has_any_role("ADMIN")


# Rôles métier, du plus élevé au plus faible
_ROLE_PRIORITY = ("ADMIN", "PROFESSIONAL", "BABYSITTER", "PARENT")


def _primary_role(roles: list[str], default: str = "PARENT") -> str:
    upper = [r.upper() for r in roles]
    for candidate in _ROLE_PRIORITY:
        if candidate in upper:
            return candidate
    return upper[0] if upper else default


def _display_name(request: Request) -> str:
    raw = request.headers.get("X-User-Display-Name", "")
    try:
        # La Gateway encode au format formulaire (URLEncoder) : « + » représente une espace
        name = unquote_plus(raw).strip() if raw else ""
    except Exception:  # noqa: BLE001 - en-tête mal encodé : ignoré
        name = ""
    return name[:120]


def require_roles(user: "UserContext", *roles: str) -> None:
    """403 si l'utilisateur n'a aucun des rôles demandés (ADMIN est toujours autorisé)."""
    if user.is_admin or user.has_any_role(*roles):
        return
    raise ForbiddenError(f"Action réservée au rôle : {' ou '.join(roles)}")


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
        all_roles = [r.strip().upper() for r in request.headers.get("X-User-Roles", raw_role).split(",") if r.strip()]
        return UserContext(
            user_id=user_id,
            role=_primary_role(roles + all_roles),
            roles=list(dict.fromkeys(roles + all_roles)),
            display_name=_display_name(request),
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
    realm_access = payload.get("realm_access") or {}
    if isinstance(realm_access, dict):
        roles += [str(r).upper() for r in realm_access.get("roles", [])]
    if payload.get("role"):
        roles.append(str(payload["role"]).upper())
    name = str(payload.get("name") or payload.get("preferred_username") or "")[:120]

    return UserContext(
        user_id=user_id,
        role=_primary_role(roles),
        roles=list(dict.fromkeys(roles)),
        raw_user_id=raw_user_id,
        token=token,
        display_name=name,
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
