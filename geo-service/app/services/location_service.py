from datetime import datetime, timezone
from typing import List, Optional, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.config import settings
from app.models.geo import GeoPoint
from app.models.location import NearbyParentResponse, UserLocationResponse
from app.services.geo_service import (
    blur_location,
    haversine_distance_m,
    round_distance_anti_triangulation,
)
from app.services.neighborhood_service import NeighborhoodService


class LocationService:
    """Service handling parent location registration, blurring, proximity and nearby queries."""

    @classmethod
    async def register_location(
        cls, db: AsyncIOMotorDatabase, user_id: str, raw_lng: float, raw_lat: float
    ) -> Tuple[UserLocationResponse, Optional[str]]:
        """
        Register a user's location.
        - Blurs coordinates server-side with stable HMAC offset (never stores exact position).
        - Automatically finds and attaches neighborhood.
        - Upserts user_locations document.
        - Returns (UserLocationResponse, neighborhood_id).
        """
        # 1. Apply server-side stable blur (~200m)
        blurred_lng, blurred_lat = blur_location(
            lng=raw_lng,
            lat=raw_lat,
            radius_m=settings.LOCATION_BLUR_M,
            user_id=user_id,
            salt=settings.BLUR_SALT
        )

        # 2. Detect neighborhood containing the blurred position
        neighborhood = await NeighborhoodService.find_by_point(
            db, lng=blurred_lng, lat=blurred_lat
        )
        neighborhood_id = neighborhood.id if neighborhood else None

        now = datetime.now(timezone.utc)
        blurred_point = {"type": "Point", "coordinates": [blurred_lng, blurred_lat]}

        update_doc = {
            "$set": {
                "location": blurred_point,
                "neighborhood_id": neighborhood_id,
                "precision_m": settings.LOCATION_BLUR_M,
                "updated_at": now
            },
            "$setOnInsert": {
                "user_id": user_id,
                "verified": False
            }
        }

        # 3. Upsert user location
        await db.user_locations.update_one(
            {"user_id": user_id},
            update_doc,
            upsert=True
        )

        # Fetch resulting document to get verified status
        doc = await db.user_locations.find_one({"user_id": user_id})
        response = UserLocationResponse(
            user_id=user_id,
            location=GeoPoint(type="Point", coordinates=(blurred_lng, blurred_lat)),
            neighborhood_id=neighborhood_id,
            precision_m=settings.LOCATION_BLUR_M,
            verified=doc.get("verified", False) if doc else False,
            updated_at=now
        )

        return response, neighborhood_id

    @classmethod
    async def get_user_location(
        cls, db: AsyncIOMotorDatabase, user_id: str
    ) -> Optional[UserLocationResponse]:
        """Retrieve user's stored blurred location."""
        doc = await db.user_locations.find_one({"user_id": user_id})
        if not doc:
            return None

        loc_point = None
        if "location" in doc and doc["location"] is not None:
            coords = doc["location"].get("coordinates", [0.0, 0.0])
            loc_point = GeoPoint(type="Point", coordinates=(coords[0], coords[1]))

        return UserLocationResponse(
            user_id=doc["user_id"],
            location=loc_point,
            neighborhood_id=doc.get("neighborhood_id"),
            precision_m=doc.get("precision_m", settings.LOCATION_BLUR_M),
            verified=doc.get("verified", False),
            updated_at=doc.get("updated_at", datetime.now(timezone.utc))
        )

    @classmethod
    async def find_nearby_public(
        cls,
        db: AsyncIOMotorDatabase,
        lng: float,
        lat: float,
        radius_m: float,
        caller_user_id: str,
        limit: int = 20,
        skip: int = 0
    ) -> List[NearbyParentResponse]:
        """
        Execute $geoNear aggregation to find nearby parents.
        - Excludes caller.
        - Anonymizes results (no identity, no coordinates).
        - Applies anti-triangulation rounding (nearest 100m).
        """
        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [lng, lat]},
                    "distanceField": "distance_m",
                    "maxDistance": radius_m,
                    "spherical": True,
                    "query": {
                        "user_id": {"$ne": caller_user_id},
                        "location": {"$exists": True}
                    }
                }
            },
            {"$skip": skip},
            {"$limit": limit},
            {
                "$project": {
                    "_id": 0,
                    "user_id": 1,
                    "distance_m": 1
                }
            }
        ]

        cursor = db.user_locations.aggregate(pipeline)
        raw_results = await cursor.to_list(length=limit)

        return [
            NearbyParentResponse(
                user_id=r["user_id"],
                distance_m=round_distance_anti_triangulation(r["distance_m"])
            )
            for r in raw_results
        ]

    @classmethod
    async def get_proximity_between_users(
        cls, db: AsyncIOMotorDatabase, caller_id: str, target_id: str
    ) -> Optional[float]:
        """Calculate Haversine distance in meters between two parents' blurred locations."""
        caller_loc = await cls.get_user_location(db, caller_id)
        target_loc = await cls.get_user_location(db, target_id)

        if not caller_loc or not caller_loc.location:
            return None
        if not target_loc or not target_loc.location:
            return None

        lng1, lat1 = caller_loc.location.coordinates
        lng2, lat2 = target_loc.location.coordinates

        distance = haversine_distance_m(lng1, lat1, lng2, lat2)
        return round(distance, 2)
