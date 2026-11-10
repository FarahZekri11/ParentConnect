"""
app/repositories/request_repository.py
────────────────────────────────────────
Data-access layer for BabysittingRequest entities.
All queries are async; callers manage the transaction/commit.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.request import BabysittingRequest, RequestStatusEnum
from app.schemas.request import BabysittingRequestCreate


@dataclass
class RequestFilters:
    """Optional filters for listing requests."""
    date: date | None = None
    neighborhood: str | None = None
    status: RequestStatusEnum | None = None
    requester_id: UUID | None = None


class BabysittingRequestRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, requester_id: UUID, data: BabysittingRequestCreate
    ) -> BabysittingRequest:
        obj = BabysittingRequest(
            requester_id=requester_id,
            date=data.date,
            start_time=data.start_time,
            end_time=data.end_time,
            neighborhood=data.neighborhood,
            num_children=data.num_children,
            child_age_ranges=data.child_age_ranges,
            notes=data.notes,
            status=RequestStatusEnum.OPEN,
        )
        self._session.add(obj)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, request_id: UUID) -> BabysittingRequest | None:
        stmt = select(BabysittingRequest).where(BabysittingRequest.id == request_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_locked(self, request_id: UUID) -> BabysittingRequest | None:
        """SELECT FOR UPDATE – use inside a transaction to prevent races."""
        stmt = (
            select(BabysittingRequest)
            .where(BabysittingRequest.id == request_id)
            .with_for_update()
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(
        self,
        filters: RequestFilters,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[BabysittingRequest], int]:
        stmt = select(BabysittingRequest)
        count_stmt = select(func.count()).select_from(BabysittingRequest)

        # Dynamic filter building
        conditions = []
        if filters.date is not None:
            conditions.append(BabysittingRequest.date == filters.date)
        if filters.neighborhood is not None:
            conditions.append(
                BabysittingRequest.neighborhood.ilike(f"%{filters.neighborhood}%")
            )
        if filters.status is not None:
            conditions.append(BabysittingRequest.status == filters.status)
        if filters.requester_id is not None:
            conditions.append(BabysittingRequest.requester_id == filters.requester_id)

        if conditions:
            from sqlalchemy import and_

            stmt = stmt.where(and_(*conditions))
            count_stmt = count_stmt.where(and_(*conditions))

        total_result = await self._session.execute(count_stmt)
        total = total_result.scalar_one()

        stmt = (
            stmt.order_by(BabysittingRequest.date.asc(), BabysittingRequest.start_time.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all()), total

    async def update_status(
        self, request_id: UUID, status: RequestStatusEnum
    ) -> BabysittingRequest:
        obj = await self.get_by_id(request_id)
        if obj is None:
            raise NotFoundError(f"BabysittingRequest {request_id} not found")
        obj.status = status
        await self._session.flush()
        await self._session.refresh(obj)
        return obj
