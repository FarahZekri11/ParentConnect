"""
app/services/booking_service.py
────────────────────────────────
Business logic for creating and managing bookings.

State machine enforced here (not in DB – enums are just labels):
  OPEN request + POST /accept  → creates PENDING booking → marks request BOOKED
  PENDING                      → ACCEPTED (babysitter confirms)
  ACCEPTED or PENDING          → CANCELLED
  ACCEPTED                     → COMPLETED → credits transferred

Double-booking prevention:
  Layer 1 (fast):  Redis slot lock (30 s TTL) acquired before DB write.
  Layer 2 (safe):  babysitter overlap check via SELECT + BookingRepository.
  Layer 3 (final): DB-level UNIQUE constraint on request_id (one booking/request).
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_client import RedisClient
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    DoubleBookingError,
    ForbiddenError,
    NotFoundError,
    StateTransitionError,
)
from app.core.logging import get_logger
from app.events.publisher import BookingAcceptedEvent, EventPublisher
from app.models.booking import Booking, BookingStatus
from app.models.credit import TransactionType
from app.models.request import RequestStatusEnum
from app.repositories.availability_repository import AvailabilityRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.credit_repository import CreditRepository
from app.repositories.request_repository import BabysittingRequestRepository

logger = get_logger(__name__)

# Valid state transitions: {current_status: allowed_next_statuses}
VALID_TRANSITIONS: dict[BookingStatus, set[BookingStatus]] = {
    BookingStatus.PENDING: {BookingStatus.ACCEPTED, BookingStatus.CANCELLED},
    BookingStatus.ACCEPTED: {BookingStatus.COMPLETED, BookingStatus.CANCELLED},
    BookingStatus.COMPLETED: set(),   # terminal
    BookingStatus.CANCELLED: set(),   # terminal
}


def _assert_valid_transition(
    current: BookingStatus, target: BookingStatus
) -> None:
    if target not in VALID_TRANSITIONS.get(current, set()):
        raise StateTransitionError(
            f"Cannot transition booking from {current.value} to {target.value}"
        )


class BookingService:
    def __init__(
        self,
        session: AsyncSession,
        redis: RedisClient,
        event_publisher: EventPublisher,
    ) -> None:
        self._session = session
        self._redis = redis
        self._events = event_publisher
        self._booking_repo = BookingRepository(session)
        self._request_repo = BabysittingRequestRepository(session)
        self._avail_repo = AvailabilityRepository(session)
        self._credit_repo = CreditRepository(session)

    # ── Accept a request (main booking flow) ─────────────────────────────────

    async def accept_request(
        self,
        request_id: UUID,
        babysitter_id: UUID,
        availability_id: UUID,
    ) -> Booking:
        """
        Atomically:
          1. Validate request is OPEN and not already booked.
          2. Validate availability belongs to the babysitter and covers the date/time.
          3. Acquire Redis slot lock (fast-path double-booking guard).
          4. Within DB transaction:
             a. Lock request row (SELECT FOR UPDATE).
             b. Lock availability row.
             c. Check DB-level babysitter overlap.
             d. Create PENDING booking.
             e. Mark request BOOKED.
          5. Commit.
          6. Publish BookingAccepted event.
        """
        # Step 1 – validate request
        request = await self._request_repo.get_by_id(request_id)
        if request is None:
            raise NotFoundError(f"BabysittingRequest {request_id} not found")
        if request.status != RequestStatusEnum.OPEN:
            raise ConflictError(
                f"Request is already {request.status.value} and cannot be accepted"
            )

        # Step 2 – validate availability
        avail = await self._avail_repo.get_by_id(availability_id)
        if avail is None:
            raise NotFoundError(f"Availability {availability_id} not found")
        if avail.user_id != babysitter_id:
            raise ForbiddenError("This availability slot does not belong to you")
        if not avail.is_active:
            raise BadRequestError("This availability slot is no longer active")

        # Step 3 – acquire Redis lock (prevents concurrent race before DB write)
        lock_acquired = await self._redis.acquire_slot_lock(
            availability_id, babysitter_id, ttl_seconds=30
        )
        if not lock_acquired:
            raise DoubleBookingError(
                "Another booking is currently being processed for this slot. Try again."
            )

        try:
            # Step 4 – DB transaction (session managed by caller / get_db)
            req_locked = await self._request_repo.get_by_id_locked(request_id)
            if req_locked is None or req_locked.status != RequestStatusEnum.OPEN:
                raise ConflictError("Request status changed concurrently")

            avail_locked = await self._avail_repo.get_by_id_locked(availability_id)
            if avail_locked is None or not avail_locked.is_active:
                raise ConflictError("Availability changed concurrently")

            # DB-level overlap check
            overlap = await self._booking_repo.check_babysitter_overlap(
                babysitter_id, request.date, request.start_time, request.end_time
            )
            if overlap:
                raise DoubleBookingError(
                    "You already have a booking that overlaps this time slot"
                )

            # Create booking (PENDING state)
            booking = await self._booking_repo.create(
                {
                    "request_id": request_id,
                    "requester_id": request.requester_id,
                    "babysitter_id": babysitter_id,
                    "availability_id": availability_id,
                    "scheduled_date": request.date,
                    "start_time": request.start_time,
                    "end_time": request.end_time,
                    "status": BookingStatus.PENDING,
                }
            )

            # Mark request as BOOKED
            await self._request_repo.update_status(request_id, RequestStatusEnum.BOOKED)

            await self._session.commit()

            # Step 5 – Publish event (outside transaction – eventual consistency OK)
            event = BookingAcceptedEvent(
                booking_id=booking.id,
                requester_id=booking.requester_id,
                babysitter_id=babysitter_id,
                scheduled_date=booking.scheduled_date,
                start_time=booking.start_time,
                end_time=booking.end_time,
                neighborhood=request.neighborhood,
            )
            await self._events.publish_booking_accepted(event)

            logger.info(
                "booking_created",
                booking_id=str(booking.id),
                request_id=str(request_id),
                babysitter_id=str(babysitter_id),
            )
            return booking

        finally:
            # Always release the Redis lock regardless of outcome
            await self._redis.release_slot_lock(availability_id)

    # ── State transitions ─────────────────────────────────────────────────────

    async def cancel_booking(self, booking_id: UUID, user_id: UUID) -> Booking:
        """Cancel a PENDING or ACCEPTED booking."""
        booking = await self._booking_repo.get_by_id(booking_id)
        if booking is None:
            raise NotFoundError(f"Booking {booking_id} not found")
        if booking.requester_id != user_id and booking.babysitter_id != user_id:
            raise ForbiddenError("You are not part of this booking")
        _assert_valid_transition(booking.status, BookingStatus.CANCELLED)

        booking = await self._booking_repo.update_status(
            booking_id, BookingStatus.CANCELLED
        )
        # Revert request to OPEN so another babysitter can accept it
        await self._request_repo.update_status(booking.request_id, RequestStatusEnum.OPEN)
        await self._session.commit()

        logger.info("booking_cancelled", booking_id=str(booking_id), by_user=str(user_id))
        return booking

    async def complete_booking(self, booking_id: UUID, user_id: UUID) -> Booking:
        """
        Mark an ACCEPTED booking as COMPLETED and transfer time credits:
          • Requester SPENDS hours (negative amount).
          • Babysitter EARNS hours (positive amount).
        Both transactions happen atomically in the same DB transaction.
        """
        booking = await self._booking_repo.get_by_id_locked(booking_id)
        if booking is None:
            raise NotFoundError(f"Booking {booking_id} not found")
        if booking.requester_id != user_id and booking.babysitter_id != user_id:
            raise ForbiddenError("You are not part of this booking")
        _assert_valid_transition(booking.status, BookingStatus.COMPLETED)

        # Calculate hours (Decimal precision)
        from datetime import timedelta
        from app.services.matching_service import _time_to_minutes

        duration_mins = _time_to_minutes(booking.end_time) - _time_to_minutes(booking.start_time)
        hours = Decimal(str(duration_mins)) / Decimal("60")

        # Spend credits from requester's balance (InsufficientCreditsError if too low)
        await self._credit_repo.add_transaction(
            user_id=booking.requester_id,
            amount=-hours,
            tx_type=TransactionType.SPEND,
            description=f"Childcare received – Booking {booking_id}",
            booking_id=booking_id,
        )
        # Earn credits for babysitter
        await self._credit_repo.add_transaction(
            user_id=booking.babysitter_id,
            amount=hours,
            tx_type=TransactionType.EARN,
            description=f"Childcare provided – Booking {booking_id}",
            booking_id=booking_id,
        )

        booking = await self._booking_repo.update_status(
            booking_id, BookingStatus.COMPLETED, hours_credited=hours
        )
        await self._request_repo.update_status(booking.request_id, RequestStatusEnum.COMPLETED)
        await self._session.commit()

        logger.info(
            "booking_completed",
            booking_id=str(booking_id),
            hours=str(hours),
        )
        return booking
