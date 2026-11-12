from datetime import datetime, timezone
from typing import List, Literal
from pydantic import BaseModel, Field

CircleLevel = Literal["close", "neighborhood", "all"]


class TrustCircleUpsertRequest(BaseModel):
    """Payload to create or update a trust circle."""
    level: CircleLevel = Field(..., description="Circle intimacy level: close, neighborhood, or all")
    members: List[str] = Field(default_factory=list, description="List of user_ids in this circle")


class TrustCircleResponse(BaseModel):
    """Trust circle response."""
    id: str
    owner_id: str
    level: CircleLevel
    members: List[str]
    updated_at: datetime
