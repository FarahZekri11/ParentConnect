"""
app/models/rating.py
────────────────────
Post-booking mutual rating (both parties rate each other).
Enforced invariants:
  • One rating per (booking_id, rater_id) – UniqueConstraint.
  • Score must be 1–5 – CheckConstraint.
  • rater_id != ratee_id – CheckConstraint.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Rating(Base):
    __tablename__ = "ratings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rater_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    ratee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Immutable – no updated_at
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("booking_id", "rater_id", name="uq_rating_booking_rater"),
        CheckConstraint("score >= 1 AND score <= 5", name="ck_rating_score_range"),
        CheckConstraint("rater_id != ratee_id", name="ck_rating_no_self_rate"),
    )

    def __repr__(self) -> str:
        return f"<Rating booking={self.booking_id} rater={self.rater_id} score={self.score}>"
