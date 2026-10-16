from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from app.models.geo import GeoPoint


class LocationRegisterRequest(BaseModel):
    """Payload to submit user raw coordinates for server-side blurring."""
    lng: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")
    lat: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")


class UserLocationResponse(BaseModel):
    """Current user location response (blurred)."""
    user_id: str
    location: Optional[GeoPoint] = None
    neighborhood_id: Optional[str] = None
    precision_m: float
    verified: bool
    updated_at: datetime


class NearbyParentResponse(BaseModel):
    """
    Anonymized nearby parent representation.
    Anti-triangulation rule: distance_m is rounded to the nearest 100 meters.
    No coordinates and no personal identity are revealed.
    """
    user_id: str = Field(..., description="Anonymized user identifier")
    distance_m: float = Field(..., description="Approximate distance rounded to nearest 100m")


class ProximityResponse(BaseModel):
    """Distance between two registered parents."""
    target_user_id: str
    distance_m: float = Field(..., description="Distance in meters calculated between blurred coordinates")
