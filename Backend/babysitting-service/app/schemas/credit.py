"""
app/schemas/credit.py
─────────────────────
Pydantic v2 schemas for the time-credit system.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.credit import TransactionType


class CreditTransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    booking_id: uuid.UUID | None
    amount: Decimal
    transaction_type: TransactionType
    description: str
    balance_after: Decimal
    created_at: datetime


class CreditBalanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    balance: Decimal = Field(..., description="Current time-credit balance in hours")


class CreditHistoryResponse(BaseModel):
    """Combined balance + paginated transaction history."""
    user_id: uuid.UUID
    balance: Decimal = Field(..., description="Current balance in hours")
    transactions: list[CreditTransactionRead]
    total_transactions: int
