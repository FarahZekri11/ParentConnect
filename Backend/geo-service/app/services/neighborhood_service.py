from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.neighborhood import NeighborhoodCreate, NeighborhoodResponse


class NeighborhoodService:
    """Business logic for neighborhoods management."""

    @staticmethod
    def _doc_to_response(doc: dict) -> NeighborhoodResponse:
        """Convert a Mongo document to a NeighborhoodResponse schema."""
        return NeighborhoodResponse(
            id=str(doc["_id"]),
            name=doc["name"],
            city=doc["city"],
            boundary=doc["boundary"],
            center=doc["center"],
            created_at=doc.get("created_at", datetime.now(timezone.utc))
        )

    @classmethod
    async def create_neighborhood(
        cls, db: AsyncIOMotorDatabase, payload: NeighborhoodCreate
    ) -> NeighborhoodResponse:
        """Create a new neighborhood with GeoJSON boundary and center."""
        doc = {
            "name": payload.name,
            "city": payload.city,
            "boundary": payload.boundary.model_dump(),
            "center": payload.center.model_dump(),
            "created_at": datetime.now(timezone.utc)
        }
        res = await db.neighborhoods.insert_one(doc)
        doc["_id"] = res.inserted_id
        return cls._doc_to_response(doc)

    @classmethod
    async def get_by_id(
        cls, db: AsyncIOMotorDatabase, neighborhood_id: str
    ) -> Optional[NeighborhoodResponse]:
        """Fetch a neighborhood by its identifier."""
        if not ObjectId.is_valid(neighborhood_id):
            return None
        doc = await db.neighborhoods.find_one({"_id": ObjectId(neighborhood_id)})
        if not doc:
            return None
        return cls._doc_to_response(doc)

    @classmethod
    async def find_by_point(
        cls, db: AsyncIOMotorDatabase, lng: float, lat: float
    ) -> Optional[NeighborhoodResponse]:
        """Find the neighborhood whose boundary contains the given GeoJSON point."""
        query = {
            "boundary": {
                "$geoIntersects": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [lng, lat]
                    }
                }
            }
        }
        doc = await db.neighborhoods.find_one(query)
        if not doc:
            return None
        return cls._doc_to_response(doc)

    @classmethod
    async def list_all(
        cls, db: AsyncIOMotorDatabase, skip: int = 0, limit: int = 50
    ) -> List[NeighborhoodResponse]:
        """List neighborhoods with pagination."""
        cursor = db.neighborhoods.find({}).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [cls._doc_to_response(d) for d in docs]
