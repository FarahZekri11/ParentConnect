"""
app/repositories/booking_repository.py
────────────────────────────────────────
Data-access layer for Booking entities.
Provides overlap detection and state updates used by the booking service.
"""
from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking, BookingStatus


class BookingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, data: dict) -> Booking:
        obj = Booking(**data)
        self._session.add(obj)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, booking_id: UUID) -> Booking | None:
        stmt = select(Booking).where(Booking.id == booking_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_locked(self, booking_id: UUID) -> Booking | None:
        stmt = (
            select(Booking)
            .where(Booking.id == booking_id)
            .with_for_update()
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_request_id(self, request_id: UUID) -> Booking | None:
        stmt = select(Booking).where(Booking.request_id == request_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        user_id: UUID,
        as_requester: bool = True,
        as_babysitter: bool = True,
    ) -> list[Booking]:
        conditions = []
        if as_requester:
            conditions.append(Booking.requester_id == user_id)
        if as_babysitter:
            conditions.append(Booking.babysitter_id == user_id)

        if not conditions:
            return []

        stmt = (
            select(Booking)
            .where(or_(*conditions))
            .order_by(Booking.scheduled_date.desc(), Booking.start_time.asc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def update_status(
        self,
        booking_id: UUID,
        status: BookingStatus,
        hours_credited: Decimal | None = None,
    ) -> Booking:
        from app.core.exceptions import NotFoundError

        obj = await self.get_by_id_locked(booking_id)
        if obj is None:
            raise NotFoundError(f"Booking {booking_id} not found")
        obj.status = status
        if hours_credited is not None:
            obj.hours_credited = hours_credited
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def check_babysitter_overlap(
        self,
        babysitter_id: UUID,
        target_date: date,
        start: time,
        end: time,
        exclude_id: UUID | None = None,
    ) -> bool:
        """
        Return True if the babysitter already has an ACCEPTED or PENDING booking
        that overlaps [start, end) on target_date.

        Used to enforce the no-double-booking invariant at the DB level
        (in addition to the Redis slot lock which handles race conditions).
        """
        # Overlap: existing.start_time < new.end AND existing.end_time > new.start
        overlap_cond = and_(
            Booking.start_time < end,
            Booking.end_time > start,
        )
        active_statuses = [BookingStatus.PENDING, BookingStatus.ACCEPTED]

        stmt = select(Booking.id).where(
            Booking.babysitter_id == babysitter_id,
            Booking.scheduled_date == target_date,
            Booking.status.in_(active_statuses),
            overlap_cond,
        )
        if exclude_id is not None:
            stmt = stmt.where(Booking.id != exclude_id)

        result = await self._session.execute(stmt)
        return result.first() is not None
