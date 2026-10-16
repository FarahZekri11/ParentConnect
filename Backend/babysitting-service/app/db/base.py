"""
app/db/base.py
──────────────
SQLAlchemy declarative base + TimestampMixin.
ALL models must be imported here so Alembic autogenerate can detect them.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# ── Declarative base ──────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    """Project-wide SQLAlchemy declarative base."""
    pass


# ── Mixins ────────────────────────────────────────────────────────────────────

class TimestampMixin:
    """Automatically manage created_at / updated_at columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ── Import ALL models so Alembic autogenerate can see them ────────────────────
# The imports below look unused but are intentional – they register the mapper.
from app.models.request import BabysittingRequest          # noqa: F401, E402
from app.models.availability import Availability           # noqa: F401, E402
from app.models.booking import Booking                     # noqa: F401, E402
from app.models.credit import CreditTransaction, CreditBalance  # noqa: F401, E402
from app.models.rating import Rating                       # noqa: F401, E402
