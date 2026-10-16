"""
app/models/request.py
─────────────────────
BabysittingRequest – the core entity a parent creates when they need childcare.

Status lifecycle:
  OPEN → MATCHED (matching algorithm ran) → BOOKED (booking accepted)
       → CANCELLED (requester cancelled)
       → COMPLETED (after booking completed)
"""
from __future__ import annotations

import uuid
from datetime import date, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    Enum,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class RequestStatus(str):
    OPEN = "OPEN"
    MATCHED = "MATCHED"
    BOOKED = "BOOKED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


import enum  # noqa: E402


class RequestStatusEnum(enum.Enum):
    OPEN = "OPEN"
    MATCHED = "MATCHED"
    BOOKED = "BOOKED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class BabysittingRequest(TimestampMixin, Base):
    __tablename__ = "babysitting_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # user_id from the JWT – we do NOT foreign-key to another service's table
    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    neighborhood: Mapped[str] = mapped_column(String(120), nullable=False, index=True)

    num_children: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    # Minimal child data – only age range strings (e.g. ["2-4", "6-8"]).
    # NO names, photos, or other sensitive PII.
    child_age_ranges: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[RequestStatusEnum] = mapped_column(
        Enum(
            RequestStatusEnum,
            name="request_status_enum",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=RequestStatusEnum.OPEN,
        index=True,
    )

    __table_args__ = (
        CheckConstraint("end_time > start_time", name="ck_request_time_order"),
        CheckConstraint("num_children >= 1", name="ck_request_min_children"),
    )

    def __repr__(self) -> str:
        return f"<BabysittingRequest id={self.id} status={self.status.value}>"
