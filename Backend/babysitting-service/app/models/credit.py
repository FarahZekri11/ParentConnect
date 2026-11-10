"""
app/models/credit.py
────────────────────
Time-credit mutual-aid system.

Design principles:
  • CreditTransaction  – immutable append-only ledger; never UPDATE or DELETE rows.
  • CreditBalance      – mutable balance cache for O(1) reads; updated inside the
                         same transaction as each ledger insert (row-locked).
  • balance_after      – snapshot stored on every ledger row for audit trail.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TransactionType(enum.Enum):
    EARN = "EARN"          # babysitter earns credits for hours worked
    SPEND = "SPEND"        # parent spends credits for hours received
    ADJUSTMENT = "ADJUSTMENT"  # admin correction


class CreditTransaction(Base):
    """
    Immutable ledger row.  Never update or delete – only INSERT.
    """
    __tablename__ = "credit_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # Positive = credit (earning), negative = debit (spending)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(
            TransactionType,
            name="transaction_type_enum",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)

    # Running-balance snapshot for fast audit queries (no need to sum history)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # No updated_at – this row is immutable
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<CreditTransaction id={self.id} user={self.user_id} amount={self.amount}>"


class CreditBalance(Base):
    """
    Mutable balance cache keyed by user_id.
    Always updated inside the same DB transaction as the ledger insert,
    after a SELECT FOR UPDATE row lock, to prevent races.
    """
    __tablename__ = "credit_balances"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<CreditBalance user={self.user_id} balance={self.balance}>"
