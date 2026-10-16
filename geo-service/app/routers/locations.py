from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.database import get_db
from app.events.publisher import event_publisher
from app.models.location import (
    LocationRegisterRequest,
    NearbyParentResponse,
    ProximityResponse,
    UserLocationResponse,
)
from app.security import get_current_user, UserTokenPayload
from app.services.location_service import LocationService

router = APIRouter(tags=["Locations"])


@router.post(
    "/locations",
    response_model=UserLocationResponse,
    summary="Register user location with server-side blurring"
)
async def register_location(
    payload: LocationRegisterRequest,
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> UserLocationResponse:
    """
    Register and blur user position (~200m).
    Detects neighborhood automatically and publishes geo.neighbor_joined if attached.
    """
    response, neighborhood_id = await LocationService.register_location(
        db=db,
        user_id=current_user.user_id,
        raw_lng=payload.lng,
        raw_lat=payload.lat
    )

    # Publish neighbor joined event if attached to a neighborhood
    if neighborhood_id:
        await event_publisher.publish_event(
            routing_key="geo.neighbor_joined",
            data={
                "user_id": current_user.user_id,
                "neighborhood_id": neighborhood_id
            }
        )

    return response


@router.get(
    "/locations/me",
    response_model=UserLocationResponse,
    summary="Get current user registered location"
)
async def get_my_location(
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> UserLocationResponse:
    """Retrieve current caller's stored blurred location."""
    user_loc = await LocationService.get_user_location(db, current_user.user_id)
    if not user_loc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No location registered for current user"
        )
    return user_loc


@router.get(
    "/nearby",
    response_model=List[NearbyParentResponse],
    summary="Find anonymized nearby parents"
)
async def get_nearby_parents(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Center latitude"),
    lng: float = Query(..., ge=-180.0, le=180.0, description="Center longitude"),
    radius: float = Query(
        ...,
        gt=0.0,
        le=settings.MAX_SEARCH_RADIUS_M,
        description=f"Search radius in meters (max {settings.MAX_SEARCH_RADIUS_M}m)"
    ),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> List[NearbyParentResponse]:
    """
    Search for parents within search radius using MongoDB $geoNear.
    Results are strictly anonymized and distance is rounded to nearest 100m.
    """
    return await LocationService.find_nearby_public(
        db=db,
        lng=lng,
        lat=lat,
        radius_m=radius,
        caller_user_id=current_user.user_id,
        limit=limit,
        skip=skip
    )


@router.get(
    "/users/{id}/proximity",
    response_model=ProximityResponse,
    summary="Calculate distance between two parents"
)
async def get_user_proximity(
    id: str,
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> ProximityResponse:
    """Calculate distance in meters between caller and target user."""
    distance = await LocationService.get_proximity_between_users(
        db=db,
        caller_id=current_user.user_id,
        target_id=id
    )
    if distance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Could not calculate proximity: one or both users have not registered their location"
        )
    return ProximityResponse(target_user_id=id, distance_m=distance)
