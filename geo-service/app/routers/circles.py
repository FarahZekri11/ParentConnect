from typing import List
from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.models.circle import TrustCircleResponse, TrustCircleUpsertRequest
from app.security import get_current_user, UserTokenPayload
from app.services.circle_service import CircleService

router = APIRouter(tags=["Trust Circles"])


@router.post(
    "/circles",
    response_model=TrustCircleResponse,
    summary="Create or update a trust circle"
)
async def upsert_trust_circle(
    payload: TrustCircleUpsertRequest,
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> TrustCircleResponse:
    """Create or update members for a trust circle level (close, neighborhood, all)."""
    return await CircleService.upsert_circle(
        db=db,
        owner_id=current_user.user_id,
        payload=payload
    )


@router.get(
    "/circles",
    response_model=List[TrustCircleResponse],
    summary="Get caller trust circles"
)
async def get_my_trust_circles(
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> List[TrustCircleResponse]:
    """Retrieve all trust circles belonging to current user."""
    return await CircleService.get_user_circles(db=db, owner_id=current_user.user_id)
