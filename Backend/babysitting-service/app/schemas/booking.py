"""
app/schemas/booking.py
──────────────────────
Pydantic v2 schemas for Bookings.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.booking import BookingStatus


class AcceptRequestBody(BaseModel):
    """Body for POST /requests/{id}/accept."""
    availability_id: uuid.UUID = Field(
        ...,
        description="The babysitter's availability slot to use for this booking",
        examples=["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
    )


class BookingCreate(BaseModel):
    """Direct booking creation (used internally and by tests)."""
    request_id: uuid.UUID
    availability_id: uuid.UUID


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    requester_id: uuid.UUID
    babysitter_id: uuid.UUID
    availability_id: uuid.UUID
    scheduled_date: date
    start_time: time
    end_time: time
    status: BookingStatus
    hours_credited: Decimal | None
    created_at: datetime
    updated_at: datetime


class BookingListResponse(BaseModel):
    items: list[BookingRead]
    total: int
