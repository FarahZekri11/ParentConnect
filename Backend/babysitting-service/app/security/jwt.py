"""
app/security/jwt.py
───────────────────
JWT validation and (dev-only) token creation.

Production flow:
  1. Identity service issues a JWT signed with JWT_SECRET (HS256 by default).
  2. This service validates the signature and extracts user_id / role claims.
  3. No calls to the Identity service are needed for normal auth – JWT is self-contained.

Dev-only helper:
  create_test_jwt() lets you generate tokens for Swagger / curl testing.
  The /dev/token endpoint (routers/dev.py) exposes this under ENVIRONMENT=development.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import ExpiredSignatureError, JWTError, jwt

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError

settings = get_settings()

# Required claims every token must carry
_REQUIRED_CLAIMS = {"sub", "role", "exp"}


def verify_token(token: str) -> dict:
    """
    Validate a JWT and return its full decoded payload.

    Raises:
        UnauthorizedError: if the token is missing, expired, malformed,
                           or lacks required claims.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": list(_REQUIRED_CLAIMS)},
        )
    except ExpiredSignatureError:
        raise UnauthorizedError("Token has expired")
    except JWTError as exc:
        raise UnauthorizedError(f"Invalid token: {exc}")

    # Ensure sub is a valid UUID (Identity service stores user_id as UUID string)
    try:
        UUID(payload["sub"])
    except (ValueError, KeyError):
        raise UnauthorizedError("Token 'sub' claim is not a valid UUID")

    return payload


def decode_token_claims(token: str) -> dict:
    """
    Decode without signature verification – ONLY for internal tooling / tests.
    Never use this for auth decisions.
    """
    return jwt.get_unverified_claims(token)


def create_test_jwt(
    user_id: UUID,
    role: str = "parent",
    *,
    secret: str | None = None,
    expire_minutes: int | None = None,
) -> str:
    """
    Create a signed JWT for local development and testing.

    This function must NEVER be called in production – the guard in
    routers/dev.py ensures the endpoint is only mounted in dev/test.

    Args:
        user_id:        The user UUID to embed in the 'sub' claim.
        role:           Role string ('parent', 'babysitter', 'admin').
        secret:         Override the default secret (useful in unit tests).
        expire_minutes: Override the default expiry.

    Returns:
        Signed JWT string.
    """
    _secret = secret or settings.JWT_SECRET
    _expire = expire_minutes or settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=_expire),
    }
    return jwt.encode(payload, _secret, algorithm=settings.JWT_ALGORITHM)
