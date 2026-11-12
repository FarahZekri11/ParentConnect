"""
app/repositories/rating_repository.py
───────────────────────────────────────
Data-access layer for Rating entities.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.models.booking import Booking, BookingStatus
from app.models.rating import Rating
from app.schemas.rating import RatingCreate


class RatingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, rater_id: UUID, data: RatingCreate) -> Rating:
        # Validate: booking must exist and be COMPLETED
        booking_stmt = select(Booking).where(Booking.id == data.booking_id)
        booking = (await self._session.execute(booking_stmt)).scalar_one_or_none()
        if booking is None:
            raise NotFoundError(f"Booking {data.booking_id} not found")
        if booking.status != BookingStatus.COMPLETED:
            raise ForbiddenError("Ratings can only be submitted for COMPLETED bookings")

        # Determine ratee_id from the booking
        if rater_id == booking.requester_id:
            ratee_id = booking.babysitter_id
        elif rater_id == booking.babysitter_id:
            ratee_id = booking.requester_id
        else:
            raise ForbiddenError("You were not part of this booking")

        # Check for duplicate
        existing = await self.get_by_booking_and_rater(data.booking_id, rater_id)
        if existing is not None:
            raise ConflictError("You have already submitted a rating for this booking")

        obj = Rating(
            booking_id=data.booking_id,
            rater_id=rater_id,
            ratee_id=ratee_id,
            score=data.score,
            comment=data.comment,
        )
        self._session.add(obj)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, rating_id: UUID) -> Rating | None:
        stmt = select(Rating).where(Rating.id == rating_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_booking_and_rater(
        self, booking_id: UUID, rater_id: UUID
    ) -> Rating | None:
        stmt = select(Rating).where(
            Rating.booking_id == booking_id, Rating.rater_id == rater_id
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_average_rating(self, user_id: UUID) -> float | None:
        stmt = select(func.avg(Rating.score)).where(Rating.ratee_id == user_id)
        result = await self._session.execute(stmt)
        avg = result.scalar_one_or_none()
        return float(avg) if avg is not None else None

    async def list_for_user(self, user_id: UUID) -> list[Rating]:
        stmt = (
            select(Rating)
            .where(Rating.ratee_id == user_id)
            .order_by(Rating.created_at.desc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
