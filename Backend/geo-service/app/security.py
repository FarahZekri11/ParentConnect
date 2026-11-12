import logging
import secrets
from typing import List, Optional
import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from app.config import settings

logger = logging.getLogger(__name__)

security_bearer = HTTPBearer(auto_error=False)


class UserTokenPayload(BaseModel):
    """Decoded JWT payload containing identity and permissions."""
    sub: str = Field(default="", description="Subject user ID")
    preferred_username: Optional[str] = Field(default=None, description="Keycloak username")
    role: str = Field(default="USER", description="Primary user role, e.g., USER, PARENT, PROFESSIONAL, ADMIN")
    roles: List[str] = Field(default_factory=list, description="Keycloak realm_access roles")
    exp: Optional[int] = Field(default=None, description="Expiration timestamp")

    @property
    def user_id(self) -> str:
        return self.sub or self.preferred_username or ""

    @property
    def is_admin(self) -> bool:
        all_roles = [r.upper() for r in self.roles]
        return "ADMIN" in all_roles or self.role.upper() == "ADMIN"

    def has_role(self, required_role: str) -> bool:
        all_roles = [r.upper() for r in self.roles]
        target = required_role.upper()
        return target in all_roles or self.role.upper() == target


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    x_gateway_auth: Optional[str] = Header(None, alias="X-Gateway-Auth"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role")
) -> UserTokenPayload:
    """
    Authenticate user via either:
    1. Gateway Relay Mode:
       If 'X-Gateway-Auth: verified' is present, trust forwarded identity (X-User-Id, X-User-Role).
    2. Direct Mode (JWT Bearer):
       Validate RS256 signature using Keycloak Realm public key (or HS256/test secret).
       Extract 'sub' or 'preferred_username' and 'realm_access.roles'.
    Returns 401 Unauthorized if missing, invalid, or expired.
    """
    # 1. Gateway Relay Mode
    if x_gateway_auth and x_gateway_auth.strip().lower() == "verified":
        if not x_user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing X-User-Id header from verified gateway",
                headers={"WWW-Authenticate": "Bearer"}
            )
        role = x_user_role or "USER"
        return UserTokenPayload(
            sub=x_user_id,
            preferred_username=x_user_id,
            role=role,
            roles=[role]
        )

    # 2. Direct Mode (JWT Bearer)
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
            options={"require": ["sub"]} if algorithm == "HS256" else {"verify_signature": True}
        )

        sub = payload.get("sub") or payload.get("preferred_username")
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing user identity",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Extract roles from realm_access.roles (Keycloak) and direct role claim
        roles: List[str] = []
        realm_access = payload.get("realm_access")
        if isinstance(realm_access, dict):
            realm_roles = realm_access.get("roles", [])
            if isinstance(realm_roles, list):
                roles.extend([str(r) for r in realm_roles])

        direct_role = payload.get("role")
        if direct_role and str(direct_role) not in roles:
            roles.append(str(direct_role))

        # Determine primary role
        primary_role = "USER"
        upper_roles = [r.upper() for r in roles]
        if "ADMIN" in upper_roles:
            primary_role = "ADMIN"
        elif "PROFESSIONAL" in upper_roles:
            primary_role = "PROFESSIONAL"
        elif "BABYSITTER" in upper_roles:
            primary_role = "BABYSITTER"
        elif "PARENT" in upper_roles:
            primary_role = "PARENT"
        elif roles:
            primary_role = roles[0]

        return UserTokenPayload(
            sub=str(sub),
            preferred_username=payload.get("preferred_username"),
            role=primary_role,
            roles=roles,
            exp=payload.get("exp")
        )
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
    Returns 403 Forbidden if user lacks ADMIN role.
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
    if not secrets.compare_digest(x_internal_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal API key"
        )

    return x_internal_key


def forward_auth_headers(request: Request) -> dict:
    """
    Forward incoming Authorization Bearer and tracing headers for inter-service HTTP calls.
    """
    headers = {}
    auth = request.headers.get("Authorization")
    if auth:
        headers["Authorization"] = auth
    req_id = request.headers.get("X-Request-ID")
    if req_id:
        headers["X-Request-ID"] = req_id
    return headers
