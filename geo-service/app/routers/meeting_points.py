from typing import List
from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.models.meeting_point import MeetingPointCreate, MeetingPointResponse
from app.security import get_current_user, require_admin, UserTokenPayload
from app.services.meeting_point_service import MeetingPointService

router = APIRouter(tags=["Meeting Points"])


@router.get(
    "/meeting-points",
    response_model=List[MeetingPointResponse],
    summary="Get safe meeting points for a neighborhood"
)
async def list_meeting_points_by_neighborhood(
    neighborhoodId: str = Query(..., description="Target neighborhood identifier"),
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> List[MeetingPointResponse]:
    """Retrieve safe meeting points (parks, daycares, town halls) in a neighborhood."""
    return await MeetingPointService.get_by_neighborhood(db, neighborhood_id=neighborhoodId)


@router.post(
    "/meeting-points",
    response_model=MeetingPointResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a meeting point (Admin only)"
)
async def create_meeting_point(
    payload: MeetingPointCreate,
    admin: UserTokenPayload = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> MeetingPointResponse:
    """Register a new safe meeting point in a neighborhood."""
    return await MeetingPointService.create_meeting_point(db, payload)
