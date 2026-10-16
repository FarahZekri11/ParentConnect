import logging
import secrets
from typing import Optional
import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from app.config import settings

logger = logging.getLogger(__name__)

security_bearer = HTTPBearer(auto_error=False)


class UserTokenPayload(BaseModel):
    """Decoded JWT payload containing identity and permissions."""
    sub: str = Field(..., description="Subject user ID")
    role: str = Field(default="USER", description="User role, e.g., USER or ADMIN")
    exp: Optional[int] = Field(default=None, description="Expiration timestamp")

    @property
    def user_id(self) -> str:
        return self.sub

    @property
    def is_admin(self) -> bool:
        return self.role.upper() == "ADMIN"


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
) -> UserTokenPayload:
    """
    Validate the incoming JWT token locally without contacting Identity service.
    Verifies signature and claims (sub, role, expiration).
    Returns 401 if token is absent, invalid, or expired.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = credentials.credentials
    key = settings.get_jwt_verification_key()
    algorithm = settings.JWT_ALGORITHM

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            options={"require": ["sub"]}
        )
        return UserTokenPayload(**payload)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"}
        )


async def require_admin(
    current_user: UserTokenPayload = Depends(get_current_user)
) -> UserTokenPayload:
    """
    Ensure the authenticated user has ADMIN privileges.
    Returns 403 Forbidden if role != ADMIN.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user


async def verify_internal_key(
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key")
) -> str:
    """
    Verify internal inter-service API key using constant-time comparison.
    Raises 403 Forbidden if missing or invalid.
    """
    if not x_internal_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing X-Internal-Key header"
        )

    expected_key = settings.INTERNAL_API_KEY
    # Constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(x_internal_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal API key"
        )

    return x_internal_key
