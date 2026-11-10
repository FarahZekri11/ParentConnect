"""
app/schemas/rating.py
─────────────────────
Pydantic v2 schemas for the rating system.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RatingCreate(BaseModel):
    booking_id: uuid.UUID = Field(
        ...,
        description="ID of the completed booking to rate",
        examples=["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
    )
    score: int = Field(
        ..., ge=1, le=5, description="Rating score from 1 (poor) to 5 (excellent)", examples=[5]
    )
    comment: str | None = Field(
        None,
        max_length=500,
        description="Optional free-text comment",
        examples=["Great with the kids, very punctual!"],
    )


class RatingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    rater_id: uuid.UUID
    ratee_id: uuid.UUID
    score: int
    comment: str | None
    created_at: datetime
