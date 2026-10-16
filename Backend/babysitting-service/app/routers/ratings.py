"""
app/routers/ratings.py
───────────────────────
POST /api/babysitting/ratings
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.repositories.rating_repository import RatingRepository
from app.schemas.rating import RatingCreate, RatingRead
from app.security.dependencies import UserContext, get_current_user

router = APIRouter(prefix="/ratings", tags=["Ratings"])


@router.post(
    "",
    response_model=RatingRead,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a rating after a completed booking",
    description=(
        "Either party (requester or babysitter) can rate the other after a COMPLETED booking. "
        "One rating per booking per user. Score: 1 (poor) to 5 (excellent)."
    ),
)
async def create_rating(
    body: RatingCreate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RatingRead:
    repo = RatingRepository(db)
    rating = await repo.create(rater_id=user.user_id, data=body)
    await db.commit()
    return RatingRead.model_validate(rating)
