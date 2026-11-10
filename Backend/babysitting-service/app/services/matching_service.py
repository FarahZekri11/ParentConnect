"""
app/services/matching_service.py
─────────────────────────────────
Matching algorithm: given a BabysittingRequest, find and rank compatible
availability slots.

Scoring model (total = 100 points):
  ┌──────────────────────┬────────────────────────────────────────────────────┐
  │ Dimension            │ Max pts │ Formula                                  │
  ├──────────────────────┼─────────┼──────────────────────────────────────────┤
  │ time_overlap         │ 40      │ overlap_minutes / request_minutes * 40   │
  │ neighborhood_match   │ 30      │ 30 if exact match, 15 if partial         │
  │ rating_score         │ 20      │ (avg_rating - 1) / 4 * 20               │
  │ reliability_score    │ 10      │ min(total_bookings / 20, 1) * 10         │
  └──────────────────────┴─────────┴──────────────────────────────────────────┘

Extensibility notes:
  • Add new dimensions by extending _score_candidate().
  • Add geo-distance scoring by injecting a distance function.
  • Add ML reranking by postprocessing the scored list.
  • Cache results in Redis with TTL (done in the router layer).
"""
from __future__ import annotations

from datetime import date, datetime, time
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.identity_client import IdentityClientProtocol, UserProfile
from app.core.logging import get_logger
from app.models.availability import Availability
from app.models.request import BabysittingRequest
from app.repositories.availability_repository import AvailabilityRepository
from app.repositories.rating_repository import RatingRepository
from app.schemas.matching import MatchListResponse, MatchResult

logger = get_logger(__name__)

# ── Weight constants (easy to tune without touching algorithm logic) ───────────
W_TIME_OVERLAP = 40.0
W_NEIGHBORHOOD = 30.0
W_RATING = 20.0
W_RELIABILITY = 10.0


def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _overlap_minutes(
    req_start: time, req_end: time, avail_start: time, avail_end: time
) -> int:
    """Compute the overlap in minutes between two time windows."""
    start = max(_time_to_minutes(req_start), _time_to_minutes(avail_start))
    end = min(_time_to_minutes(req_end), _time_to_minutes(avail_end))
    return max(0, end - start)


def _slot_covers_date(avail: Availability, target_date: date) -> bool:
    """Check whether an availability slot is valid for the given date."""
    if avail.is_recurring:
        return avail.day_of_week == target_date.weekday()
    return avail.date == target_date


def _score_candidate(
    request: BabysittingRequest,
    avail: Availability,
    profile: UserProfile | None,
) -> tuple[float, dict[str, float]]:
    """
    Compute a composite score and the per-dimension breakdown.

    Returns:
        (total_score, reasoning_dict)
    """
    reasoning: dict[str, float] = {}

    # ── 1. Time overlap (40 pts) ──────────────────────────────────────────────
    req_duration = _time_to_minutes(request.end_time) - _time_to_minutes(request.start_time)
    overlap = _overlap_minutes(
        request.start_time, request.end_time, avail.start_time, avail.end_time
    )
    if req_duration > 0 and overlap > 0:
        time_score = (overlap / req_duration) * W_TIME_OVERLAP
    else:
        time_score = 0.0
    reasoning["time_overlap"] = round(time_score, 2)

    # ── 2. Neighbourhood match (30 pts) ───────────────────────────────────────
    req_nb = request.neighborhood.lower().strip()
    avail_nb = avail.neighborhood.lower().strip()
    if req_nb == avail_nb:
        nb_score = W_NEIGHBORHOOD            # exact match
    elif req_nb in avail_nb or avail_nb in req_nb:
        nb_score = W_NEIGHBORHOOD / 2        # partial / sub-district match
    else:
        nb_score = 0.0
    reasoning["neighborhood_match"] = round(nb_score, 2)

    # ── 3. Rating score (20 pts) ──────────────────────────────────────────────
    if profile and profile.average_rating > 0:
        # Normalise from [1, 5] → [0, W_RATING]
        rating_score = ((profile.average_rating - 1.0) / 4.0) * W_RATING
    else:
        # No ratings yet: give neutral score (middle of the range)
        rating_score = W_RATING / 2
    reasoning["rating_score"] = round(rating_score, 2)

    # ── 4. Reliability / experience (10 pts) ──────────────────────────────────
    if profile:
        # Caps at 20 completed bookings → full 10 pts
        reliability_score = min(profile.total_bookings / 20.0, 1.0) * W_RELIABILITY
    else:
        reliability_score = 0.0
    reasoning["reliability_score"] = round(reliability_score, 2)

    total = time_score + nb_score + rating_score + reliability_score
    return round(total, 2), reasoning


class MatchingService:
    def __init__(
        self,
        session: AsyncSession,
        identity_client: IdentityClientProtocol,
    ) -> None:
        self._avail_repo = AvailabilityRepository(session)
        self._rating_repo = RatingRepository(session)
        self._identity = identity_client

    async def find_matches(self, request: BabysittingRequest) -> MatchListResponse:
        """
        Return all compatible, scored, and ranked availability slots for a request.

        Algorithm:
          1. Fetch all active availabilities in the same neighbourhood.
          2. Filter out the requester's own slots (can't babysit yourself).
          3. Filter to slots that cover the request date.
          4. Filter to slots with at least partial time overlap.
          5. Enrich with identity profiles (batch call).
          6. Score and sort descending.
        """
        # Step 1 – candidate slots (neighbourhood pre-filter in DB for efficiency)
        candidates = await self._avail_repo.list_all_active(
            neighborhood=request.neighborhood
        )

        # Step 2 – remove requester's own slots
        candidates = [c for c in candidates if c.user_id != request.requester_id]

        # Step 3 – date coverage filter
        candidates = [c for c in candidates if _slot_covers_date(c, request.date)]

        # Step 4 – time overlap filter (must have at least 1 minute overlap)
        candidates = [
            c
            for c in candidates
            if _overlap_minutes(
                request.start_time, request.end_time, c.start_time, c.end_time
            )
            > 0
        ]

        if not candidates:
            logger.info(
                "no_candidates_found",
                request_id=str(request.id),
                neighborhood=request.neighborhood,
                date=str(request.date),
            )
            return MatchListResponse(
                request_id=request.id, matches=[], total=0
            )

        # Step 5 – batch identity lookup
        babysitter_ids = list({c.user_id for c in candidates})
        profiles = await self._identity.get_users_batch(babysitter_ids)

        # Step 6 – score and sort
        results: list[MatchResult] = []
        for avail in candidates:
            profile = profiles.get(avail.user_id)
            score, reasoning = _score_candidate(request, avail, profile)

            # Determine the concrete date for this slot
            if avail.is_recurring:
                scheduled_date = request.date
            else:
                scheduled_date = avail.date  # type: ignore[assignment]

            results.append(
                MatchResult(
                    availability_id=avail.id,
                    babysitter_id=avail.user_id,
                    score=score,
                    neighborhood=avail.neighborhood,
                    scheduled_date=scheduled_date,
                    start_time=avail.start_time,
                    end_time=avail.end_time,
                    reasoning=reasoning,
                )
            )

        results.sort(key=lambda r: r.score, reverse=True)

        logger.info(
            "matches_found",
            request_id=str(request.id),
            total=len(results),
            top_score=results[0].score if results else 0,
        )
        return MatchListResponse(
            request_id=request.id, matches=results, total=len(results)
        )
