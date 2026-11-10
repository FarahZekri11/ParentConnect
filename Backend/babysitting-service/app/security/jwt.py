"""
app/security/jwt.py
───────────────────
JWT validation supporting Keycloak (RS256) and local HMAC (HS256).

Authentication Modes:
  1. Keycloak RS256:
     Validates the asymmetric RS256 signature using the realm public key
     loaded from KEYCLOAK_REALM_PUBLIC_KEY.
     Extracts user ID from 'sub' or 'preferred_username'.
     Extracts user roles from 'realm_access.roles' (e.g. ADMIN, PARENT, PROFESSIONAL).

  2. Dev/Test HS256:
     Fallback when KEYCLOAK_REALM_PUBLIC_KEY is not set.
     Validates using JWT_SECRET.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import uuid
from uuid import UUID

from jose import ExpiredSignatureError, JWTError, jwt

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


def format_rsa_public_key(key: str) -> str:
    """Ensure RSA public key is in valid PEM format."""
    cleaned = key.strip().replace("\\n", "\n")
    if "-----BEGIN PUBLIC KEY-----" in cleaned:
        return cleaned
    # Wrap base64 string with PEM header/footer
    compact = "".join(cleaned.split())
    chunked = "\n".join(compact[i : i + 64] for i in range(0, len(compact), 64))
    return f"-----BEGIN PUBLIC KEY-----\n{chunked}\n-----END PUBLIC KEY-----"


def parse_user_id(sub_or_username: str) -> UUID:
    """
    Parse a user identifier into a valid UUID.
    If the string is already a valid UUID, parse directly.
    Otherwise, generate a deterministic RFC 4122 v5 UUID from the identifier.
    """
    try:
        return UUID(sub_or_username)
    except (ValueError, AttributeError):
        return uuid.uuid5(uuid.NAMESPACE_DNS, str(sub_or_username))


def verify_token(token: str) -> dict[str, Any]:
    """
    Validate a JWT token and extract payload claims.

    Supports:
      - RS256 with Keycloak realm public key (when KEYCLOAK_REALM_PUBLIC_KEY is configured).
      - HS256 with JWT_SECRET (dev/test fallback).

    Raises:
      UnauthorizedError (401): if the token is missing, expired, or signature is invalid.
    """
    if not token:
        raise UnauthorizedError("Token is missing")

    current_settings = get_settings()
    use_rs256 = bool(current_settings.KEYCLOAK_REALM_PUBLIC_KEY)

    try:
        if use_rs256:
            public_key = format_rsa_public_key(current_settings.KEYCLOAK_REALM_PUBLIC_KEY)  # type: ignore[arg-type]
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                options={"verify_aud": False, "verify_signature": True},
            )
        else:
            payload = jwt.decode(
                token,
                current_settings.JWT_SECRET,
                algorithms=[current_settings.JWT_ALGORITHM, "HS256"],
                options={"verify_aud": False, "verify_signature": True},
            )
    except ExpiredSignatureError:
        raise UnauthorizedError("Token has expired")
    except JWTError as exc:
        raise UnauthorizedError(f"Invalid token signature or structure: {exc}")
    except Exception as exc:
        raise UnauthorizedError(f"Token verification error: {exc}")

    # Extract user identifier (sub or preferred_username)
    raw_user_id = str(payload.get("sub") or payload.get("preferred_username") or "")
    if not raw_user_id:
        raise UnauthorizedError("Token missing 'sub' or 'preferred_username' claim")

    # Extract roles from realm_access.roles or top-level claims
    roles: list[str] = []
    realm_access = payload.get("realm_access")
    if isinstance(realm_access, dict):
        raw_roles = realm_access.get("roles", [])
        if isinstance(raw_roles, list):
            roles.extend(str(r) for r in raw_roles)

    if not roles and "roles" in payload and isinstance(payload["roles"], list):
        roles.extend(str(r) for r in payload["roles"])

    if not roles and "role" in payload:
        roles.append(str(payload["role"]))

    # Normalize roles to uppercase
    normalized_roles = [r.upper() for r in roles]

    # Determine primary role
    primary_role = "PARENT"
    found = False
    for r in ["ADMIN", "PROFESSIONAL", "BABYSITTER", "PARENT"]:
        if r in normalized_roles:
            primary_role = r
            found = True
            break
    if not found and normalized_roles:
        primary_role = normalized_roles[0]

    payload["roles"] = normalized_roles
    payload["role"] = primary_role
    payload["sub"] = raw_user_id

    return payload


def decode_token_claims(token: str) -> dict[str, Any]:
    """Decode without signature verification – ONLY for internal debugging / logging."""
    return jwt.get_unverified_claims(token)


def create_test_jwt(
    user_id: UUID | str,
    role: str = "PARENT",
    *,
    secret: str | None = None,
    expire_minutes: int | None = None,
) -> str:
    """
    Create a signed JWT for local development and testing (HS256).
    """
    _secret = secret or settings.JWT_SECRET
    _expire = expire_minutes or settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    now = datetime.now(tz=timezone.utc)
    role_upper = role.upper()
    payload = {
        "sub": str(user_id),
        "preferred_username": f"user_{str(user_id)[:8]}",
        "role": role_upper,
        "realm_access": {"roles": [role_upper]},
        "iat": now,
        "exp": now + timedelta(minutes=_expire),
    }
    return jwt.encode(payload, _secret, algorithm="HS256")
