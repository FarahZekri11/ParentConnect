"""
tests/unit/test_matching.py
────────────────────────────
Unit tests for the matching algorithm.
These tests are pure Python – no DB, no network.
They test the scoring functions directly and the full pipeline via mocked repos.
"""
from __future__ import annotations

import uuid
from datetime import date, time
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.clients.identity_client import UserProfile
from app.models.availability import Availability
from app.models.request import BabysittingRequest, RequestStatusEnum
from app.services.matching_service import (
    MatchingService,
    W_NEIGHBORHOOD,
    W_RATING,
    W_RELIABILITY,
    W_TIME_OVERLAP,
    _overlap_minutes,
    _score_candidate,
    _slot_covers_date,
    _time_to_minutes,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helper factories
# ─────────────────────────────────────────────────────────────────────────────

def make_request(
    start_h: int = 9,
    start_m: int = 0,
    end_h: int = 17,
    end_m: int = 0,
    neighborhood: str = "Montmartre",
    target_date: date | None = None,
) -> BabysittingRequest:
    req = MagicMock(spec=BabysittingRequest)
    req.id = uuid.uuid4()
    req.requester_id = uuid.uuid4()
    req.date = target_date or date(2026, 11, 15)  # Saturday
    req.start_time = time(start_h, start_m)
    req.end_time = time(end_h, end_m)
    req.neighborhood = neighborhood
    req.num_children = 1
    req.child_age_ranges = ["3-5"]
    return req


def make_availability(
    user_id: uuid.UUID | None = None,
    start_h: int = 8,
    start_m: int = 0,
    end_h: int = 18,
    end_m: int = 0,
    neighborhood: str = "Montmartre",
    is_recurring: bool = False,
    day_of_week: int | None = None,
    slot_date: date | None = None,
) -> Availability:
    avail = MagicMock(spec=Availability)
    avail.id = uuid.uuid4()
    avail.user_id = user_id or uuid.uuid4()
    avail.start_time = time(start_h, start_m)
    avail.end_time = time(end_h, end_m)
    avail.neighborhood = neighborhood
    avail.is_recurring = is_recurring
    avail.day_of_week = day_of_week
    avail.date = slot_date or date(2026, 11, 15)
    avail.is_active = True
    return avail


def make_profile(
    user_id: uuid.UUID | None = None,
    avg_rating: float = 4.5,
    total_bookings: int = 10,
) -> UserProfile:
    return UserProfile(
        user_id=user_id or uuid.uuid4(),
        display_name="Test User",
        average_rating=avg_rating,
        total_bookings=total_bookings,
        is_verified=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# _time_to_minutes
# ─────────────────────────────────────────────────────────────────────────────

class TestTimeToMinutes:
    def test_midnight(self):
        assert _time_to_minutes(time(0, 0)) == 0

    def test_noon(self):
        assert _time_to_minutes(time(12, 0)) == 720

    def test_end_of_day(self):
        assert _time_to_minutes(time(23, 59)) == 1439

    def test_arbitrary(self):
        assert _time_to_minutes(time(9, 30)) == 570


# ─────────────────────────────────────────────────────────────────────────────
# _overlap_minutes
# ─────────────────────────────────────────────────────────────────────────────

class TestOverlapMinutes:
    def test_full_containment(self):
        # Availability 08:00–18:00 fully contains request 09:00–17:00
        assert _overlap_minutes(time(9), time(17), time(8), time(18)) == 480

    def test_exact_match(self):
        assert _overlap_minutes(time(9), time(17), time(9), time(17)) == 480

    def test_no_overlap_before(self):
        # Availability ends before request starts
        assert _overlap_minutes(time(14), time(17), time(8), time(12)) == 0

    def test_no_overlap_after(self):
        # Availability starts after request ends
        assert _overlap_minutes(time(9), time(12), time(14), time(18)) == 0

    def test_partial_overlap_start(self):
        # Request 09:00–17:00, Availability 07:00–11:00 → overlap 09:00–11:00 = 120 min
        assert _overlap_minutes(time(9), time(17), time(7), time(11)) == 120

    def test_partial_overlap_end(self):
        # Request 09:00–17:00, Availability 15:00–20:00 → overlap 15:00–17:00 = 120 min
        assert _overlap_minutes(time(9), time(17), time(15), time(20)) == 120

    def test_touching_boundaries_no_overlap(self):
        # Request ends at 12:00, availability starts at 12:00 → 0 overlap
        assert _overlap_minutes(time(9), time(12), time(12), time(17)) == 0


# ─────────────────────────────────────────────────────────────────────────────
# _slot_covers_date
# ─────────────────────────────────────────────────────────────────────────────

class TestSlotCoversDate:
    def test_one_off_exact_date(self):
        avail = make_availability(is_recurring=False, slot_date=date(2026, 11, 15))
        assert _slot_covers_date(avail, date(2026, 11, 15)) is True

    def test_one_off_wrong_date(self):
        avail = make_availability(is_recurring=False, slot_date=date(2026, 11, 15))
        assert _slot_covers_date(avail, date(2026, 11, 16)) is False

    def test_recurring_correct_weekday(self):
        # 2026-11-15 is a Sunday (weekday 6)
        avail = make_availability(is_recurring=True, day_of_week=6)
        assert _slot_covers_date(avail, date(2026, 11, 15)) is True

    def test_recurring_wrong_weekday(self):
        # 2026-11-15 is Sunday=6, but slot is Monday=0
        avail = make_availability(is_recurring=True, day_of_week=0)
        assert _slot_covers_date(avail, date(2026, 11, 15)) is False


# ─────────────────────────────────────────────────────────────────────────────
# _score_candidate
# ─────────────────────────────────────────────────────────────────────────────

class TestScoreCandidate:
    def test_perfect_score(self):
        """Full overlap, exact neighbourhood, 5-star rating, 20 bookings."""
        req = make_request(9, 0, 17, 0, "Montmartre")
        avail = make_availability(8, 0, 18, 0, "Montmartre")
        profile = make_profile(avg_rating=5.0, total_bookings=20)

        score, reasoning = _score_candidate(req, avail, profile)

        assert reasoning["time_overlap"] == W_TIME_OVERLAP  # 100% overlap → 40
        assert reasoning["neighborhood_match"] == W_NEIGHBORHOOD  # exact → 30
        assert reasoning["rating_score"] == W_RATING  # 5 stars → 20
        assert reasoning["reliability_score"] == W_RELIABILITY  # 20+ bookings → 10
        assert score == W_TIME_OVERLAP + W_NEIGHBORHOOD + W_RATING + W_RELIABILITY  # 100.0

    def test_zero_score_no_overlap_different_neighbourhood(self):
        req = make_request(9, 0, 12, 0, "Montmartre")
        avail = make_availability(14, 0, 18, 0, "Belleville")  # no overlap, wrong neighbourhood
        profile = make_profile(avg_rating=1.0, total_bookings=0)

        score, reasoning = _score_candidate(req, avail, profile)

        assert reasoning["time_overlap"] == 0.0
        assert reasoning["neighborhood_match"] == 0.0
        # Rating: 1 star → 0 points for rating, but we still have reliability = 0
        assert score == reasoning["rating_score"] + reasoning["reliability_score"]

    def test_partial_time_overlap(self):
        """Avail covers half the request window."""
        req = make_request(9, 0, 17, 0)  # 8h = 480 min
        avail = make_availability(13, 0, 20, 0)  # overlap = 4h = 240 min
        profile = make_profile(avg_rating=3.0, total_bookings=0)

        score, reasoning = _score_candidate(req, avail, profile)

        # 240/480 * 40 = 20
        assert reasoning["time_overlap"] == 20.0

    def test_no_profile_uses_neutral_rating(self):
        req = make_request()
        avail = make_availability()
        score, reasoning = _score_candidate(req, avail, None)

        # neutral rating = W_RATING / 2 = 10
        assert reasoning["rating_score"] == W_RATING / 2
        assert reasoning["reliability_score"] == 0.0  # no profile

    def test_partial_neighbourhood_match(self):
        req = make_request(neighborhood="Montmartre")
        avail = make_availability(neighborhood="Montmartre Nord")
        profile = make_profile()

        _, reasoning = _score_candidate(req, avail, profile)
        assert reasoning["neighborhood_match"] == W_NEIGHBORHOOD / 2  # partial

    def test_reliability_caps_at_20_bookings(self):
        req = make_request()
        avail = make_availability()
        profile = make_profile(total_bookings=100)  # way over 20

        _, reasoning = _score_candidate(req, avail, profile)
        assert reasoning["reliability_score"] == W_RELIABILITY  # capped at 10

    def test_score_is_always_between_0_and_100(self):
        import random

        random.seed(42)
        for _ in range(50):
            req = make_request(
                start_h=random.randint(6, 12),
                end_h=random.randint(13, 22),
            )
            avail = make_availability(
                start_h=random.randint(6, 12),
                end_h=random.randint(13, 22),
            )
            profile = make_profile(
                avg_rating=round(random.uniform(1, 5), 1),
                total_bookings=random.randint(0, 50),
            )
            score, _ = _score_candidate(req, avail, profile)
            assert 0.0 <= score <= 100.0, f"Score out of range: {score}"


# ─────────────────────────────────────────────────────────────────────────────
# MatchingService.find_matches – integration-level (mocked repos)
# ─────────────────────────────────────────────────────────────────────────────

class TestMatchingServiceFindMatches:
    def _make_service(
        self, availabilities: list, profiles: dict
    ) -> MatchingService:
        session = MagicMock()
        identity = MagicMock()
        svc = MatchingService(session=session, identity_client=identity)

        avail_repo = AsyncMock()
        avail_repo.list_all_active.return_value = availabilities
        svc._avail_repo = avail_repo

        rating_repo = AsyncMock()
        svc._rating_repo = rating_repo

        identity.get_users_batch = AsyncMock(return_value=profiles)
        return svc

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_candidates(self):
        req = make_request()
        svc = self._make_service([], {})
        result = await svc.find_matches(req)
        assert result.matches == []
        assert result.total == 0

    @pytest.mark.asyncio
    async def test_excludes_requester_own_slot(self):
        req = make_request()
        # The only candidate belongs to the requester themselves
        avail = make_availability(user_id=req.requester_id, slot_date=req.date)
        svc = self._make_service([avail], {})
        result = await svc.find_matches(req)
        assert result.matches == []

    @pytest.mark.asyncio
    async def test_excludes_wrong_date(self):
        req = make_request(target_date=date(2026, 11, 15))
        avail = make_availability(slot_date=date(2026, 11, 16))  # wrong date
        uid = avail.user_id
        profile = make_profile(user_id=uid)
        svc = self._make_service([avail], {uid: profile})
        result = await svc.find_matches(req)
        assert result.matches == []

    @pytest.mark.asyncio
    async def test_results_sorted_by_score_descending(self):
        req = make_request(9, 0, 17, 0, "Montmartre", target_date=date(2026, 11, 15))

        # Avail A: perfect overlap + exact neighbourhood → high score
        avail_a = make_availability(8, 0, 18, 0, "Montmartre", slot_date=date(2026, 11, 15))
        uid_a = avail_a.user_id
        profile_a = make_profile(user_id=uid_a, avg_rating=5.0, total_bookings=20)

        # Avail B: partial overlap + different neighbourhood → lower score
        avail_b = make_availability(14, 0, 18, 0, "Belleville", slot_date=date(2026, 11, 15))
        uid_b = avail_b.user_id
        profile_b = make_profile(user_id=uid_b, avg_rating=2.0, total_bookings=0)

        svc = self._make_service(
            [avail_a, avail_b], {uid_a: profile_a, uid_b: profile_b}
        )
        result = await svc.find_matches(req)

        assert len(result.matches) == 2
        # Best match should be A
        assert result.matches[0].availability_id == avail_a.id
        assert result.matches[0].score > result.matches[1].score

    @pytest.mark.asyncio
    async def test_recurring_slot_resolved_to_request_date(self):
        target = date(2026, 11, 15)  # Sunday = weekday 6
        req = make_request(target_date=target)
        avail = make_availability(
            is_recurring=True, day_of_week=6, slot_date=None  # recurring Sunday
        )
        uid = avail.user_id
        profile = make_profile(user_id=uid)
        svc = self._make_service([avail], {uid: profile})
        result = await svc.find_matches(req)

        assert len(result.matches) == 1
        assert result.matches[0].scheduled_date == target
