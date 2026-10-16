from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.models.neighborhood import NeighborhoodCreate, NeighborhoodResponse
from app.security import get_current_user, require_admin, UserTokenPayload
from app.services.neighborhood_service import NeighborhoodService

router = APIRouter(tags=["Neighborhoods"])


@router.post(
    "/neighborhoods",
    response_model=NeighborhoodResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new neighborhood (Admin only)"
)
async def create_neighborhood(
    payload: NeighborhoodCreate,
    admin: UserTokenPayload = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> NeighborhoodResponse:
    """Create a neighborhood with a boundary polygon and central point."""
    return await NeighborhoodService.create_neighborhood(db, payload)


@router.get(
    "/neighborhoods/by-point",
    response_model=NeighborhoodResponse,
    summary="Find neighborhood containing geographic point"
)
async def get_neighborhood_by_point(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lng: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> NeighborhoodResponse:
    """Find the neighborhood covering the given coordinates via $geoIntersects."""
    neighborhood = await NeighborhoodService.find_by_point(db, lng=lng, lat=lat)
    if not neighborhood:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No neighborhood found for the specified coordinates"
        )
    return neighborhood


@router.get(
    "/neighborhoods/{id}",
    response_model=NeighborhoodResponse,
    summary="Get neighborhood details by ID"
)
async def get_neighborhood_by_id(
    id: str,
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> NeighborhoodResponse:
    """Retrieve details for a specific neighborhood."""
    neighborhood = await NeighborhoodService.get_by_id(db, neighborhood_id=id)
    if not neighborhood:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Neighborhood with ID {id} not found"
        )
    return neighborhood


@router.get(
    "/neighborhoods",
    response_model=List[NeighborhoodResponse],
    summary="List all neighborhoods"
)
async def list_neighborhoods(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> List[NeighborhoodResponse]:
    """Retrieve list of neighborhoods with pagination."""
    return await NeighborhoodService.list_all(db, skip=skip, limit=limit)
