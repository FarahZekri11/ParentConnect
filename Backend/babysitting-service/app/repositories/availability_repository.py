"""
app/repositories/availability_repository.py
─────────────────────────────────────────────
Data-access layer for Availability entities.
"""
from __future__ import annotations

from datetime import date, time
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.availability import Availability
from app.schemas.availability import AvailabilityCreate, AvailabilityUpdate


class AvailabilityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, user_id: UUID, data: AvailabilityCreate) -> Availability:
        obj = Availability(
            user_id=user_id,
            is_recurring=data.is_recurring,
            day_of_week=data.day_of_week,
            date=data.date,
            start_time=data.start_time,
            end_time=data.end_time,
            neighborhood=data.neighborhood,
            is_active=True,
        )
        self._session.add(obj)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, avail_id: UUID) -> Availability | None:
        stmt = select(Availability).where(Availability.id == avail_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_locked(self, avail_id: UUID) -> Availability | None:
        """SELECT FOR UPDATE NOWAIT – raise immediately if locked (booking flow)."""
        stmt = (
            select(Availability)
            .where(Availability.id == avail_id)
            .with_for_update(nowait=True)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(
        self, user_id: UUID, active_only: bool = True
    ) -> list[Availability]:
        stmt = select(Availability).where(Availability.user_id == user_id)
        if active_only:
            stmt = stmt.where(Availability.is_active.is_(True))
        stmt = stmt.order_by(Availability.created_at.desc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def list_all_active(
        self, neighborhood: str | None = None
    ) -> list[Availability]:
        stmt = select(Availability).where(Availability.is_active.is_(True))
        if neighborhood:
            stmt = stmt.where(Availability.neighborhood.ilike(f"%{neighborhood}%"))
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def update(self, avail_id: UUID, data: AvailabilityUpdate) -> Availability:
        from app.core.exceptions import NotFoundError

        obj = await self.get_by_id(avail_id)
        if obj is None:
            raise NotFoundError(f"Availability {avail_id} not found")
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(obj, field, value)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def deactivate(self, avail_id: UUID) -> None:
        """Soft-delete: set is_active=False instead of physical deletion."""
        from app.core.exceptions import NotFoundError

        obj = await self.get_by_id(avail_id)
        if obj is None:
            raise NotFoundError(f"Availability {avail_id} not found")
        obj.is_active = False
        await self._session.flush()

    async def find_overlapping(
        self,
        user_id: UUID,
        target_date: date,
        start: time,
        end: time,
        exclude_id: UUID | None = None,
    ) -> list[Availability]:
        """
        Find active slots for a user that overlap with [start, end) on target_date.
        Checks both one-off slots on target_date and recurring slots matching that weekday.
        """
        weekday = target_date.weekday()  # 0=Monday

        # Overlap condition: start_time < end AND end_time > start
        overlap = and_(Availability.start_time < end, Availability.end_time > start)

        # Matches one-off on target_date OR recurring on that weekday
        date_match = or_(
            and_(Availability.is_recurring.is_(False), Availability.date == target_date),
            and_(Availability.is_recurring.is_(True), Availability.day_of_week == weekday),
        )

        stmt = (
            select(Availability)
            .where(
                Availability.user_id == user_id,
                Availability.is_active.is_(True),
                date_match,
                overlap,
            )
        )
        if exclude_id is not None:
            stmt = stmt.where(Availability.id != exclude_id)

        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_user(self, user_id: UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(Availability)
            .where(Availability.user_id == user_id, Availability.is_active.is_(True))
        )
        result = await self._session.execute(stmt)
        return result.scalar_one()
