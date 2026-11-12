from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from app.models.geo import GeoPoint, GeoPolygon


class NeighborhoodCreate(BaseModel):
    """Schema for creating a neighborhood."""
    name: str = Field(..., min_length=2, max_length=100, examples=["Lafayette"])
    city: str = Field(..., min_length=2, max_length=100, examples=["Tunis"])
    boundary: GeoPolygon = Field(..., description="GeoJSON polygon covering the neighborhood area")
    center: GeoPoint = Field(..., description="GeoJSON point representing neighborhood center")


class NeighborhoodResponse(BaseModel):
    """Schema for returning neighborhood details."""
    id: str = Field(..., description="Neighborhood unique identifier")
    name: str
    city: str
    boundary: GeoPolygon
    center: GeoPoint
    created_at: datetime


class NeighborhoodInDB(BaseModel):
    """Internal MongoDB document representation."""
    name: str
    city: str
    boundary: GeoPolygon
    center: GeoPoint
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
