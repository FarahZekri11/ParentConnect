"""
app/routers/admin.py
────────────────────
GET /api/babysitting/admin/stats   (ADMIN) — compteurs réels pour le tableau de bord administrateur.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.db.session import get_db
from app.models.booking import Booking
from app.repositories.availability_repository import AvailabilityRepository
from app.repositories.request_repository import BabysittingRequestRepository
from app.security.dependencies import UserContext, get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats", summary="Statistiques du module (ADMIN)")
async def stats(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not user.is_admin:
        raise ForbiddenError("Statistiques réservées aux administrateurs.")
    requests_by_status = await BabysittingRequestRepository(db).count_by_status()
    avail = AvailabilityRepository(db)
    rows = (await db.execute(select(Booking.status, func.count()).group_by(Booking.status))).all()
    bookings_by_status = {str(getattr(s, "value", s)): int(c) for s, c in rows}
    return {
        "requests": sum(requests_by_status.values()),
        "requests_by_status": requests_by_status,
        "active_availabilities": await avail.count_active(),
        "babysitters_with_availability": await avail.count_distinct_users(),
        "bookings": sum(bookings_by_status.values()),
        "bookings_by_status": bookings_by_status,
    }
