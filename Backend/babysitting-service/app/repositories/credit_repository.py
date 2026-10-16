"""
app/repositories/credit_repository.py
───────────────────────────────────────
Immutable ledger + balance cache repository.

Critical invariants (enforced in add_transaction):
  1. SELECT FOR UPDATE on CreditBalance before computing new balance.
  2. Reject if new_balance < settings.MIN_CREDIT_BALANCE.
  3. Update CreditBalance.
  4. Insert CreditTransaction with balance_after snapshot.
  All steps execute within the SAME database transaction (caller commits).
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import InsufficientCreditsError
from app.models.credit import CreditBalance, CreditTransaction, TransactionType

settings = get_settings()


class CreditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Balance ──────────────────────────────────────────────────────────────

    async def get_balance(self, user_id: UUID) -> Decimal:
        """Fast O(1) balance read from the cache table."""
        balance_row = await self._get_or_create_balance(user_id, lock=False)
        return balance_row.balance

    async def _get_or_create_balance(
        self, user_id: UUID, lock: bool = False
    ) -> CreditBalance:
        stmt = select(CreditBalance).where(CreditBalance.user_id == user_id)
        if lock:
            stmt = stmt.with_for_update()
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            row = CreditBalance(user_id=user_id, balance=Decimal("0"))
            self._session.add(row)
            await self._session.flush()
        return row

    # ── Transactions ──────────────────────────────────────────────────────────

    async def add_transaction(
        self,
        user_id: UUID,
        amount: Decimal,
        tx_type: TransactionType,
        description: str,
        booking_id: UUID | None = None,
    ) -> CreditTransaction:
        """
        Atomically update the balance and append a ledger row.

        Steps (all in the caller's transaction):
          1. Lock the CreditBalance row (SELECT FOR UPDATE).
          2. Compute new_balance = current + amount.
          3. Reject if new_balance < MIN_CREDIT_BALANCE.
          4. Update CreditBalance.
          5. Insert CreditTransaction with balance_after snapshot.
        """
        # Step 1 – row-locked read
        balance_row = await self._get_or_create_balance(user_id, lock=True)
        current_balance = balance_row.balance

        # Step 2 – compute
        new_balance = current_balance + amount

        # Step 3 – enforce minimum balance
        min_balance = Decimal(str(settings.MIN_CREDIT_BALANCE))
        if new_balance < min_balance:
            raise InsufficientCreditsError(
                f"This transaction would bring your balance to {new_balance:.2f} h, "
                f"below the minimum allowed ({min_balance:.2f} h). "
                f"Earn more credits before requesting childcare."
            )

        # Step 4 – update balance cache
        balance_row.balance = new_balance

        # Step 5 – insert ledger row
        tx = CreditTransaction(
            user_id=user_id,
            booking_id=booking_id,
            amount=amount,
            transaction_type=tx_type,
            description=description,
            balance_after=new_balance,
        )
        self._session.add(tx)
        await self._session.flush()
        await self._session.refresh(tx)
        return tx

    async def get_history(
        self, user_id: UUID, limit: int = 50, offset: int = 0
    ) -> tuple[list[CreditTransaction], int]:
        """Return paginated transaction history for a user."""
        count_stmt = (
            select(func.count())
            .select_from(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
        )
        total = (await self._session.execute(count_stmt)).scalar_one()

        stmt = (
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
            .order_by(CreditTransaction.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all()), total
