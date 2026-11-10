"""
app/schemas/matching.py
───────────────────────
Pydantic v2 schemas for matching algorithm results.
"""
from __future__ import annotations

import uuid
from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field


class MatchResult(BaseModel):
    """A single candidate availability slot with its match score."""
    availability_id: uuid.UUID = Field(..., description="Availability slot ID")
    babysitter_id: uuid.UUID = Field(..., description="User ID of the potential babysitter")
    score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Composite match score 0–100 (higher is better)",
        examples=[87.5],
    )
    neighborhood: str = Field(..., description="Babysitter's neighbourhood")
    scheduled_date: date = Field(..., description="Date of the available slot")
    start_time: time = Field(..., description="Start of available window")
    end_time: time = Field(..., description="End of available window")
    reasoning: dict[str, float] = Field(
        ...,
        description=(
            "Score breakdown by dimension. "
            "Keys: time_overlap, neighborhood_match, rating_score, reliability_score"
        ),
        examples=[
            {
                "time_overlap": 40.0,
                "neighborhood_match": 30.0,
                "rating_score": 12.5,
                "reliability_score": 5.0,
            }
        ],
    )


class MatchListResponse(BaseModel):
    request_id: uuid.UUID
    matches: list[MatchResult] = Field(
        ..., description="Ranked list of compatible availabilities (best first)"
    )
    total: int = Field(..., description="Total number of candidates found")
