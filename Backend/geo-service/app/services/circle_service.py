from datetime import datetime, timezone
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.circle import TrustCircleResponse, TrustCircleUpsertRequest


class CircleService:
    """Business logic for trust circles management."""

    @staticmethod
    def _doc_to_response(doc: dict) -> TrustCircleResponse:
        return TrustCircleResponse(
            id=str(doc["_id"]),
            owner_id=doc["owner_id"],
            level=doc["level"],
            members=doc.get("members", []),
            updated_at=doc.get("updated_at", datetime.now(timezone.utc))
        )

    @classmethod
    async def upsert_circle(
        cls, db: AsyncIOMotorDatabase, owner_id: str, payload: TrustCircleUpsertRequest
    ) -> TrustCircleResponse:
        """Create or update a trust circle for the given owner and intimacy level."""
        now = datetime.now(timezone.utc)
        # Unique list of member user_ids
        unique_members = list(dict.fromkeys(payload.members))

        await db.trust_circles.update_one(
            {"owner_id": owner_id, "level": payload.level},
            {
                "$set": {
                    "members": unique_members,
                    "updated_at": now
                },
                "$setOnInsert": {
                    "owner_id": owner_id,
                    "level": payload.level
                }
            },
            upsert=True
        )

        doc = await db.trust_circles.find_one({"owner_id": owner_id, "level": payload.level})
        return cls._doc_to_response(doc)

    @classmethod
    async def get_user_circles(
        cls, db: AsyncIOMotorDatabase, owner_id: str
    ) -> List[TrustCircleResponse]:
        """Fetch all trust circles configured by the user."""
        cursor = db.trust_circles.find({"owner_id": owner_id})
        docs = await cursor.to_list(length=10)
        return [cls._doc_to_response(d) for d in docs]
