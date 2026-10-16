from typing import List, Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.geo import GeoPoint
from app.models.meeting_point import MeetingPointCreate, MeetingPointResponse


class MeetingPointService:
    """Business logic for safe meeting points in neighborhoods."""

    @staticmethod
    def _doc_to_response(doc: dict) -> MeetingPointResponse:
        coords = doc["location"].get("coordinates", [0.0, 0.0])
        return MeetingPointResponse(
            id=str(doc["_id"]),
            neighborhood_id=str(doc["neighborhood_id"]),
            name=doc["name"],
            type=doc["type"],
            location=GeoPoint(type="Point", coordinates=(coords[0], coords[1]))
        )

    @classmethod
    async def create_meeting_point(
        cls, db: AsyncIOMotorDatabase, payload: MeetingPointCreate
    ) -> MeetingPointResponse:
        """Create a new safe meeting point."""
        doc = {
            "neighborhood_id": payload.neighborhood_id,
            "name": payload.name,
            "type": payload.type,
            "location": payload.location.model_dump()
        }
        res = await db.meeting_points.insert_one(doc)
        doc["_id"] = res.inserted_id
        return cls._doc_to_response(doc)

    @classmethod
    async def get_by_neighborhood(
        cls, db: AsyncIOMotorDatabase, neighborhood_id: str
    ) -> List[MeetingPointResponse]:
        """List safe meeting points in a specific neighborhood."""
        cursor = db.meeting_points.find({"neighborhood_id": neighborhood_id})
        docs = await cursor.to_list(length=100)
        return [cls._doc_to_response(d) for d in docs]
