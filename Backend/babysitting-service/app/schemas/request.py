"""
app/schemas/request.py
──────────────────────
Pydantic v2 schemas for BabysittingRequest.
"""
from __future__ import annotations

import uuid
from datetime import date as dt_date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.request import RequestStatusEnum


class BabysittingRequestCreate(BaseModel):
    date: dt_date = Field(
        ...,
        description="Date when childcare is needed (must be today or future)",
        examples=["2026-11-15"],
    )
    start_time: time = Field(..., description="Start time (24h)", examples=["09:00"])
    end_time: time = Field(..., description="End time (24h)", examples=["17:00"])
    neighborhood: str = Field(
        ..., min_length=2, max_length=120, description="Neighbourhood / area name", examples=["Montmartre"]
    )
    num_children: int = Field(
        ..., ge=1, le=10, description="Number of children", examples=[2]
    )
    child_age_ranges: list[str] = Field(
        ...,
        min_length=1,
        description='Age range per child, e.g. ["2-4", "6-8"]. No names.',
        examples=[["2-4", "6-8"]],
    )
    notes: str | None = Field(
        None, max_length=500, description="Optional additional notes", examples=["Allergic to nuts"]
    )

    @model_validator(mode="after")
    def validate_time_order(self) -> "BabysittingRequestCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self

    @model_validator(mode="after")
    def validate_child_counts_match(self) -> "BabysittingRequestCreate":
        if len(self.child_age_ranges) != self.num_children:
            raise ValueError(
                "child_age_ranges must have exactly num_children entries"
            )
        return self


class BabysittingRequestUpdate(BaseModel):
    """Partial update – all fields optional."""
    date: dt_date | None = None
    start_time: time | None = None
    end_time: time | None = None
    neighborhood: str | None = Field(None, min_length=2, max_length=120)
    num_children: int | None = Field(None, ge=1, le=10)
    child_age_ranges: list[str] | None = None
    notes: str | None = Field(None, max_length=500)
    status: RequestStatusEnum | None = None


class BabysittingRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requester_id: uuid.UUID
    date: dt_date
    start_time: time
    end_time: time
    neighborhood: str
    num_children: int
    child_age_ranges: list[str]
    notes: str | None
    status: RequestStatusEnum
    created_at: datetime
    updated_at: datetime


class BabysittingRequestListResponse(BaseModel):
    items: list[BabysittingRequestRead]
    total: int
    page: int
    page_size: int
