"""
app/models/booking.py
─────────────────────
Booking – created when a babysitter accepts a request.

State machine:
  PENDING  → ACCEPTED  (babysitter confirms)
           → CANCELLED (either party cancels before acceptance)
  ACCEPTED → COMPLETED (service completed, credits transferred)
           → CANCELLED (cancellation after acceptance)
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, time
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Time,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class BookingStatus(enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("babysitting_requests.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        unique=True,  # one booking per request
    )
    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    babysitter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    availability_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("availabilities.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    status: Mapped[BookingStatus] = mapped_column(
        Enum(
            BookingStatus,
            name="booking_status_enum",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=BookingStatus.PENDING,
        index=True,
    )

    # Set when status transitions to COMPLETED; used for credit calculation.
    hours_credited: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Relationships (within this service only)
    request: Mapped["BabysittingRequest"] = relationship(  # type: ignore[name-defined]
        "BabysittingRequest", lazy="select"
    )
    availability: Mapped["Availability"] = relationship(  # type: ignore[name-defined]
        "Availability", lazy="select"
    )

    __table_args__ = (
        CheckConstraint("end_time > start_time", name="ck_booking_time_order"),
    )

    def __repr__(self) -> str:
        return f"<Booking id={self.id} status={self.status.value}>"
