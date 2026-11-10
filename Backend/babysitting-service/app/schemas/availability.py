"""
app/schemas/availability.py
───────────────────────────
Pydantic v2 schemas for Availability slots.
"""
from __future__ import annotations

import uuid
from datetime import date as dt_date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AvailabilityCreate(BaseModel):
    is_recurring: bool = Field(
        ...,
        description="True for a weekly recurring slot, False for a one-off date",
        examples=[False],
    )
    day_of_week: int | None = Field(
        None,
        ge=0,
        le=6,
        description="Day of week (0=Monday..6=Sunday). Required when is_recurring=True",
        examples=[1],
    )
    date: dt_date | None = Field(
        None,
        description="Specific date. Required when is_recurring=False",
        examples=["2026-11-15"],
    )
    start_time: time = Field(..., description="Start time (24h)", examples=["09:00"])
    end_time: time = Field(..., description="End time (24h)", examples=["17:00"])
    neighborhood: str = Field(
        ..., min_length=2, max_length=120, description="Neighbourhood / area", examples=["Montmartre"]
    )

    @model_validator(mode="after")
    def validate_recurring_xor_date(self) -> "AvailabilityCreate":
        if self.is_recurring:
            if self.day_of_week is None:
                raise ValueError("day_of_week is required when is_recurring=True")
            if self.date is not None:
                raise ValueError("date must be null when is_recurring=True")
        else:
            if self.date is None:
                raise ValueError("date is required when is_recurring=False")
            if self.day_of_week is not None:
                raise ValueError("day_of_week must be null when is_recurring=False")
        return self

    @model_validator(mode="after")
    def validate_time_order(self) -> "AvailabilityCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class AvailabilityUpdate(BaseModel):
    """Partial update."""
    start_time: time | None = None
    end_time: time | None = None
    neighborhood: str | None = Field(None, min_length=2, max_length=120)
    is_active: bool | None = None


class AvailabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    is_recurring: bool
    day_of_week: int | None
    date: dt_date | None
    start_time: time
    end_time: time
    neighborhood: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AvailabilityListResponse(BaseModel):
    items: list[AvailabilityRead]
    total: int
