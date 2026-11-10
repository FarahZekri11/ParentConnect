"""
tests/unit/test_booking_state_machine.py
─────────────────────────────────────────
Unit tests for the booking state machine transitions.
Tests _assert_valid_transition() directly (pure Python, no DB needed).
Also tests BookingService.cancel_booking and complete_booking via mocked repos.
"""
from __future__ import annotations

import uuid
from datetime import date, time
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import ForbiddenError, StateTransitionError
from app.models.booking import BookingStatus
from app.services.booking_service import (
    VALID_TRANSITIONS,
    BookingService,
    _assert_valid_transition,
)


# ─────────────────────────────────────────────────────────────────────────────
# _assert_valid_transition – pure logic
# ─────────────────────────────────────────────────────────────────────────────

class TestValidTransitions:
    """Verify every cell of the state-machine transition table."""

    # ── Valid transitions ────────────────────────────────────────────────────

    def test_pending_to_accepted(self):
        _assert_valid_transition(BookingStatus.PENDING, BookingStatus.ACCEPTED)  # no raise

    def test_pending_to_cancelled(self):
        _assert_valid_transition(BookingStatus.PENDING, BookingStatus.CANCELLED)

    def test_accepted_to_completed(self):
        _assert_valid_transition(BookingStatus.ACCEPTED, BookingStatus.COMPLETED)

    def test_accepted_to_cancelled(self):
        _assert_valid_transition(BookingStatus.ACCEPTED, BookingStatus.CANCELLED)

    # ── Invalid transitions ──────────────────────────────────────────────────

    def test_pending_to_completed_invalid(self):
        with pytest.raises(StateTransitionError):
            _assert_valid_transition(BookingStatus.PENDING, BookingStatus.COMPLETED)

    def test_completed_to_any_invalid(self):
        for target in BookingStatus:
            if target != BookingStatus.COMPLETED:
                with pytest.raises(StateTransitionError):
                    _assert_valid_transition(BookingStatus.COMPLETED, target)

    def test_cancelled_to_any_invalid(self):
        for target in BookingStatus:
            if target != BookingStatus.CANCELLED:
                with pytest.raises(StateTransitionError):
                    _assert_valid_transition(BookingStatus.CANCELLED, target)

    def test_accepted_to_pending_invalid(self):
        with pytest.raises(StateTransitionError):
            _assert_valid_transition(BookingStatus.ACCEPTED, BookingStatus.PENDING)

    def test_accepted_to_accepted_invalid(self):
        with pytest.raises(StateTransitionError):
            _assert_valid_transition(BookingStatus.ACCEPTED, BookingStatus.ACCEPTED)

    # ── Error message quality ────────────────────────────────────────────────

    def test_error_message_contains_statuses(self):
        with pytest.raises(StateTransitionError) as exc_info:
            _assert_valid_transition(BookingStatus.COMPLETED, BookingStatus.PENDING)
        assert "COMPLETED" in str(exc_info.value.detail)
        assert "PENDING" in str(exc_info.value.detail)

    def test_state_transition_error_has_correct_code(self):
        with pytest.raises(StateTransitionError) as exc_info:
            _assert_valid_transition(BookingStatus.CANCELLED, BookingStatus.ACCEPTED)
        assert exc_info.value.error_code == "INVALID_STATE_TRANSITION"
        assert exc_info.value.status_code == 400

    # ── VALID_TRANSITIONS completeness ───────────────────────────────────────

    def test_all_statuses_have_entry_in_table(self):
        for status in BookingStatus:
            assert status in VALID_TRANSITIONS, f"{status} missing from VALID_TRANSITIONS"

    def test_terminal_states_have_empty_transitions(self):
        assert VALID_TRANSITIONS[BookingStatus.COMPLETED] == set()
        assert VALID_TRANSITIONS[BookingStatus.CANCELLED] == set()


# ─────────────────────────────────────────────────────────────────────────────
# BookingService – cancel_booking
# ─────────────────────────────────────────────────────────────────────────────

def make_booking(
    status: BookingStatus = BookingStatus.ACCEPTED,
    requester_id: uuid.UUID | None = None,
    babysitter_id: uuid.UUID | None = None,
) -> MagicMock:
    booking = MagicMock()
    booking.id = uuid.uuid4()
    booking.request_id = uuid.uuid4()
    booking.requester_id = requester_id or uuid.uuid4()
    booking.babysitter_id = babysitter_id or uuid.uuid4()
    booking.status = status
    booking.scheduled_date = date(2026, 11, 15)
    booking.start_time = time(9, 0)
    booking.end_time = time(17, 0)
    return booking


def make_booking_service() -> tuple[BookingService, MagicMock, MagicMock, MagicMock, MagicMock]:
    """Return service + mocked repos for testing."""
    session = AsyncMock()
    redis = AsyncMock()
    redis.acquire_slot_lock = AsyncMock(return_value=True)
    redis.release_slot_lock = AsyncMock()
    publisher = AsyncMock()

    svc = BookingService(session=session, redis=redis, event_publisher=publisher)
    svc._booking_repo = AsyncMock()
    svc._request_repo = AsyncMock()
    svc._avail_repo = AsyncMock()
    svc._credit_repo = AsyncMock()

    return svc, session, redis, publisher, svc._booking_repo


class TestCancelBooking:
    @pytest.mark.asyncio
    async def test_requester_can_cancel_pending(self):
        requester_id = uuid.uuid4()
        booking = make_booking(
            status=BookingStatus.PENDING, requester_id=requester_id
        )
        svc, session, _, _, booking_repo = make_booking_service()
        booking_repo.get_by_id.return_value = booking
        booking_repo.update_status.return_value = booking
        session.commit = AsyncMock()

        result = await svc.cancel_booking(booking.id, requester_id)
        booking_repo.update_status.assert_called_once_with(
            booking.id, BookingStatus.CANCELLED
        )

    @pytest.mark.asyncio
    async def test_babysitter_can_cancel_accepted(self):
        babysitter_id = uuid.uuid4()
        booking = make_booking(
            status=BookingStatus.ACCEPTED, babysitter_id=babysitter_id
        )
        svc, session, _, _, booking_repo = make_booking_service()
        booking_repo.get_by_id.return_value = booking
        booking_repo.update_status.return_value = booking
        session.commit = AsyncMock()

        await svc.cancel_booking(booking.id, babysitter_id)
        booking_repo.update_status.assert_called_once()

    @pytest.mark.asyncio
    async def test_third_party_cannot_cancel(self):
        booking = make_booking()
        third_party_id = uuid.uuid4()

        svc, _, _, _, booking_repo = make_booking_service()
        booking_repo.get_by_id.return_value = booking

        with pytest.raises(ForbiddenError):
            await svc.cancel_booking(booking.id, third_party_id)

    @pytest.mark.asyncio
    async def test_cannot_cancel_completed_booking(self):
        requester_id = uuid.uuid4()
        booking = make_booking(
            status=BookingStatus.COMPLETED, requester_id=requester_id
        )
        svc, _, _, _, booking_repo = make_booking_service()
        booking_repo.get_by_id.return_value = booking

        with pytest.raises(StateTransitionError):
            await svc.cancel_booking(booking.id, requester_id)

    @pytest.mark.asyncio
    async def test_cannot_cancel_already_cancelled(self):
        requester_id = uuid.uuid4()
        booking = make_booking(
            status=BookingStatus.CANCELLED, requester_id=requester_id
        )
        svc, _, _, _, booking_repo = make_booking_service()
        booking_repo.get_by_id.return_value = booking

        with pytest.raises(StateTransitionError):
            await svc.cancel_booking(booking.id, requester_id)


class TestCompleteBooking:
    @pytest.mark.asyncio
    async def test_complete_accepted_booking_transfers_credits(self):
        requester_id = uuid.uuid4()
        babysitter_id = uuid.uuid4()
        booking = make_booking(
            status=BookingStatus.ACCEPTED,
            requester_id=requester_id,
            babysitter_id=babysitter_id,
        )
        booking.start_time = time(9, 0)
        booking.end_time = time(11, 0)  # 2 hours

        svc, session, _, _, booking_repo = make_booking_service()
        booking_repo.get_by_id_locked.return_value = booking
        booking_repo.update_status.return_value = booking
        session.commit = AsyncMock()
        svc._credit_repo.add_transaction = AsyncMock()
        svc._request_repo.update_status = AsyncMock()

        await svc.complete_booking(booking.id, requester_id)

        # Should have two credit transactions
        assert svc._credit_repo.add_transaction.call_count == 2

        calls = svc._credit_repo.add_transaction.call_args_list
        amounts = [call.kwargs["amount"] for call in calls]

        # One negative (requester spends), one positive (babysitter earns)
        negative = [a for a in amounts if a < 0]
        positive = [a for a in amounts if a > 0]
        assert len(negative) == 1
        assert len(positive) == 1
        assert abs(negative[0]) == positive[0]  # symmetric
        assert positive[0] == Decimal("2.00")   # 2 hours

    @pytest.mark.asyncio
    async def test_cannot_complete_pending_booking(self):
        requester_id = uuid.uuid4()
        booking = make_booking(
            status=BookingStatus.PENDING, requester_id=requester_id
        )
        svc, _, _, _, booking_repo = make_booking_service()
        booking_repo.get_by_id_locked.return_value = booking

        with pytest.raises(StateTransitionError):
            await svc.complete_booking(booking.id, requester_id)

    @pytest.mark.asyncio
    async def test_third_party_cannot_complete(self):
        booking = make_booking(status=BookingStatus.ACCEPTED)
        svc, _, _, _, booking_repo = make_booking_service()
        booking_repo.get_by_id_locked.return_value = booking

        with pytest.raises(ForbiddenError):
            await svc.complete_booking(booking.id, uuid.uuid4())
