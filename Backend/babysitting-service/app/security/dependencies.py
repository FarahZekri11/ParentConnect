"""
app/security/dependencies.py
─────────────────────────────
FastAPI dependencies for authentication and authorisation.

Usage in routers:
    @router.get("/...")
    async def endpoint(user: UserContext = Depends(get_current_user)):
        ...

    # Role-restricted:
    @router.delete("/...")
    async def admin_endpoint(
        user: UserContext = Depends(require_role("admin"))
    ):
        ...
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from uuid import UUID

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.security.jwt import verify_token

# Points at the Identity service's token endpoint.
# Swagger UI will show a "Authorize" button using this scheme.
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/token",
    scheme_name="JWT",
    auto_error=False,   # We raise our own errors for better messages
)


@dataclass
class UserContext:
    """Decoded JWT claims relevant to this service."""
    user_id: UUID
    role: str


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
) -> UserContext:
    """
    Extract and validate the Bearer JWT from the Authorization header.
    Raises UnauthorizedError (HTTP 401) if the token is absent or invalid.
    """
    if token is None:
        raise UnauthorizedError("Authorization header with Bearer token is required")
    payload = verify_token(token)
    return UserContext(user_id=UUID(payload["sub"]), role=payload["role"])


async def optional_current_user(
    token: str | None = Depends(oauth2_scheme),
) -> UserContext | None:
    """
    Like get_current_user, but returns None instead of raising if no token
    is provided.  Used for endpoints that are readable by anonymous users.
    """
    if token is None:
        return None
    payload = verify_token(token)
    return UserContext(user_id=UUID(payload["sub"]), role=payload["role"])


def require_role(*allowed_roles: str) -> Callable:
    """
    Dependency factory that enforces one of the allowed roles.

    Example:
        Depends(require_role("admin", "moderator"))
    """
    async def _check_role(
        user: UserContext = Depends(get_current_user),
    ) -> UserContext:
        if user.role not in allowed_roles:
            raise ForbiddenError(
                f"Role '{user.role}' is not permitted. Required: {list(allowed_roles)}"
            )
        return user

    return _check_role
