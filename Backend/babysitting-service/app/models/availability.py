"""
app/models/availability.py
──────────────────────────
Availability slot – represents when a user (parent or dedicated babysitter) can
look after children.

Two modes:
  • is_recurring=True  + day_of_week (0=Mon..6=Sun)  → repeats every week
  • is_recurring=False + date                          → one-off slot
"""
from __future__ import annotations

import uuid
from datetime import date, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Integer,
    String,
    Time,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Availability(TimestampMixin, Base):
    __tablename__ = "availabilities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    # Recurring slot: day_of_week is set, date is NULL
    day_of_week: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 0=Monday … 6=Sunday

    # One-off slot: date is set, day_of_week is NULL
    date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    neighborhood: Mapped[str] = mapped_column(String(120), nullable=False, index=True)

    is_recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    __table_args__ = (
        CheckConstraint("end_time > start_time", name="ck_avail_time_order"),
        CheckConstraint(
            "(is_recurring = TRUE AND day_of_week IS NOT NULL AND date IS NULL) OR "
            "(is_recurring = FALSE AND date IS NOT NULL AND day_of_week IS NULL)",
            name="ck_avail_recurring_xor_date",
        ),
        CheckConstraint(
            "day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)",
            name="ck_avail_day_of_week_range",
        ),
    )

    def __repr__(self) -> str:
        return f"<Availability id={self.id} user={self.user_id} recurring={self.is_recurring}>"
