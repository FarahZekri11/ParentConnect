"""
app/routers/credits.py
───────────────────────
GET /api/babysitting/credits
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.repositories.credit_repository import CreditRepository
from app.schemas.credit import CreditHistoryResponse, CreditTransactionRead
from app.security.dependencies import UserContext, get_current_user

router = APIRouter(prefix="/credits", tags=["Credits"])


@router.get(
    "",
    response_model=CreditHistoryResponse,
    summary="Get credit balance and transaction history",
    description=(
        "Returns the authenticated user's current time-credit balance "
        "and paginated transaction history. "
        "Credits are in hours: positive = earned, negative = spent."
    ),
)
async def get_credits(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CreditHistoryResponse:
    repo = CreditRepository(db)
    balance = await repo.get_balance(user.user_id)
    transactions, total = await repo.get_history(user.user_id, limit=limit, offset=offset)
    return CreditHistoryResponse(
        user_id=user.user_id,
        balance=balance,
        transactions=[CreditTransactionRead.model_validate(t) for t in transactions],
        total_transactions=total,
    )
