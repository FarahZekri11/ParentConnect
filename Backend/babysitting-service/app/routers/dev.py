"""
app/routers/dev.py
───────────────────
Development-only endpoints – ONLY mounted when ENVIRONMENT != production.

Provides:
  POST /dev/token  – generate a test JWT for Swagger / curl testing.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError
from app.security.jwt import create_test_jwt

router = APIRouter(prefix="/dev", tags=["Dev (non-production only)"])


class TokenRequest(BaseModel):
    user_id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        description="User ID to embed in the JWT. Leave blank to generate a random one.",
        examples=["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
    )
    role: str = Field(
        "parent",
        description="Role claim. E.g. 'parent', 'babysitter', 'admin'",
        examples=["parent"],
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    role: str


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Generate a test JWT (dev/test only)",
    description=(
        "Creates a signed JWT with the given user_id and role. "
        "**Not available in production.** Use this to authenticate with Swagger UI."
    ),
)
async def generate_test_token(body: TokenRequest) -> TokenResponse:
    settings = get_settings()
    if settings.is_production:
        raise ForbiddenError("Test token endpoint is disabled in production")

    token = create_test_jwt(user_id=body.user_id, role=body.role)
    return TokenResponse(access_token=token, user_id=body.user_id, role=body.role)
