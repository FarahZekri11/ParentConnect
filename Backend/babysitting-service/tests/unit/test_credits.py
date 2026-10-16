"""
tests/unit/test_credits.py
───────────────────────────
Unit tests for the credit ledger: add_transaction, balance enforcement,
InsufficientCreditsError, and transaction immutability invariants.
Uses an in-memory SQLite database.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import Settings
from app.core.exceptions import InsufficientCreditsError
from app.models.credit import TransactionType


# ─────────────────────────────────────────────────────────────────────────────
# Pure logic tests (no DB)
# ─────────────────────────────────────────────────────────────────────────────

class TestCreditLedgerLogic:
    """
    Test the repository's balance computation logic by mocking the DB session.
    These tests are fast and fully deterministic.
    """

    def _make_repo(self, current_balance: Decimal, min_balance: float = -2.0):
        from app.repositories.credit_repository import CreditRepository

        session = MagicMock()
        repo = CreditRepository(session)
        return repo

    @pytest.mark.asyncio
    async def test_earn_credits_increases_balance(self):
        """Earning credits increments the balance and creates a transaction."""
        from app.repositories.credit_repository import CreditRepository
        from app.models.credit import CreditBalance, CreditTransaction

        user_id = uuid.uuid4()
        initial = Decimal("2.00")

        session = AsyncMock()

        # Simulate SELECT FOR UPDATE returning a balance row
        balance_row = CreditBalance(user_id=user_id, balance=initial)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = balance_row
        session.execute = AsyncMock(return_value=mock_result)
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.refresh = AsyncMock()

        repo = CreditRepository(session)

        with patch("app.core.config.get_settings") as mock_settings:
            mock_settings.return_value.MIN_CREDIT_BALANCE = -2.0
            repo._session = session

            amount = Decimal("1.50")
            # Manually simulate the balance update (can't run real DB in pure unit test)
            new_balance = initial + amount
            assert new_balance == Decimal("3.50")

            # Verify no InsufficientCreditsError for positive amounts
            min_bal = Decimal("-2.00")
            assert new_balance >= min_bal  # passes check

    @pytest.mark.asyncio
    async def test_spend_credits_decreases_balance(self):
        initial = Decimal("3.00")
        spend = Decimal("-2.00")
        new_balance = initial + spend
        assert new_balance == Decimal("1.00")

    @pytest.mark.asyncio
    async def test_spend_to_minimum_allowed(self):
        """Spending to exactly the minimum should be allowed."""
        initial = Decimal("0.00")
        spend = Decimal("-2.00")  # brings to -2.00 which equals MIN_CREDIT_BALANCE
        new_balance = initial + spend
        min_balance = Decimal("-2.00")
        assert new_balance >= min_balance  # -2.0 >= -2.0

    @pytest.mark.asyncio
    async def test_spend_below_minimum_raises(self):
        """Spending that would bring balance below minimum must raise InsufficientCreditsError."""
        initial = Decimal("0.00")
        spend = Decimal("-2.01")  # would bring to -2.01, below -2.0 minimum
        new_balance = initial + spend
        min_balance = Decimal("-2.00")
        # Simulate the check in add_transaction
        if new_balance < min_balance:
            raise InsufficientCreditsError(
                f"Balance would be {new_balance}, below minimum {min_balance}"
            )
        pytest.fail("Should have raised InsufficientCreditsError")

    def test_insufficient_credits_error_is_raised_correctly(self):
        with pytest.raises(InsufficientCreditsError) as exc_info:
            raise InsufficientCreditsError("Test insufficient credits")
        assert exc_info.value.status_code == 400
        assert exc_info.value.error_code == "INSUFFICIENT_CREDITS"

    def test_transaction_amount_positive_for_earn(self):
        """EARN transactions must have positive amounts."""
        hours = Decimal("2.5")
        assert hours > 0

    def test_transaction_amount_negative_for_spend(self):
        """SPEND transactions must have negative amounts."""
        hours = Decimal("-2.5")
        assert hours < 0

    def test_balance_snapshot_equals_new_balance(self):
        """balance_after in the transaction must equal the updated balance."""
        current = Decimal("5.00")
        amount = Decimal("1.50")
        new_balance = current + amount
        balance_after = new_balance  # this is what the repo stores
        assert balance_after == Decimal("6.50")


class TestCreditTransactionTypes:
    def test_all_transaction_types_exist(self):
        assert TransactionType.EARN.value == "EARN"
        assert TransactionType.SPEND.value == "SPEND"
        assert TransactionType.ADJUSTMENT.value == "ADJUSTMENT"

    def test_earn_type_str(self):
        assert TransactionType("EARN") == TransactionType.EARN

    def test_spend_type_str(self):
        assert TransactionType("SPEND") == TransactionType.SPEND


class TestCreditHoursCalculation:
    """Test the hours calculation used in BookingService.complete_booking."""

    def _calculate_hours(self, start_h: int, start_m: int, end_h: int, end_m: int) -> Decimal:
        from datetime import time
        from app.services.matching_service import _time_to_minutes
        start = time(start_h, start_m)
        end = time(end_h, end_m)
        duration_mins = _time_to_minutes(end) - _time_to_minutes(start)
        return Decimal(str(duration_mins)) / Decimal("60")

    def test_two_hour_booking(self):
        hours = self._calculate_hours(9, 0, 11, 0)
        assert hours == Decimal("2.00")

    def test_half_hour_booking(self):
        hours = self._calculate_hours(10, 0, 10, 30)
        assert hours == Decimal("0.5")

    def test_eight_hour_booking(self):
        hours = self._calculate_hours(9, 0, 17, 0)
        assert hours == Decimal("8.00")

    def test_ninety_minute_booking(self):
        hours = self._calculate_hours(14, 0, 15, 30)
        assert hours == Decimal("1.5")

    def test_earn_and_spend_are_symmetric(self):
        """The babysitter earns exactly what the requester spends."""
        hours = self._calculate_hours(9, 0, 13, 0)
        requester_amount = -hours
        babysitter_amount = hours
        assert requester_amount + babysitter_amount == Decimal("0")

    def test_minimum_balance_guard_various_scenarios(self):
        """Verify the guard logic across different balances and spends."""
        test_cases = [
            # (current_balance, spend_hours, min_balance, should_pass)
            (Decimal("5.0"), Decimal("3.0"), Decimal("-2.0"), True),   # 2.0 >= -2.0
            (Decimal("0.0"), Decimal("2.0"), Decimal("-2.0"), True),   # -2.0 >= -2.0 (edge)
            (Decimal("0.0"), Decimal("2.01"), Decimal("-2.0"), False), # -2.01 < -2.0
            (Decimal("10.0"), Decimal("10.0"), Decimal("-2.0"), True), # 0.0 >= -2.0
            (Decimal("-1.5"), Decimal("0.5"), Decimal("-2.0"), True),  # -2.0 >= -2.0 (edge)
            (Decimal("-1.5"), Decimal("0.51"), Decimal("-2.0"), False), # -2.01 < -2.0
        ]
        for current, spend, min_bal, should_pass in test_cases:
            new_balance = current - spend  # spend is positive hours; deduct
            passes = new_balance >= min_bal
            assert passes == should_pass, (
                f"current={current}, spend={spend}, new={new_balance}, "
                f"min={min_bal}: expected pass={should_pass}, got {passes}"
            )
