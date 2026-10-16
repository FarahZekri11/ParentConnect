from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.models.geo import GeoPoint

MeetingPointType = Literal["park", "daycare", "town_hall"]


class MeetingPointCreate(BaseModel):
    """Payload to create a meeting point."""
    neighborhood_id: str = Field(..., description="Target neighborhood identifier")
    name: str = Field(..., min_length=2, max_length=120, examples=["Parc du Belvédère"])
    type: MeetingPointType = Field(..., description="Type of meeting place: park, daycare, town_hall")
    location: GeoPoint = Field(..., description="GeoJSON Point [lng, lat]")


class MeetingPointResponse(BaseModel):
    """Meeting point response."""
    id: str
    neighborhood_id: str
    name: str
    type: MeetingPointType
    location: GeoPoint
