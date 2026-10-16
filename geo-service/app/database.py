import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manages the MongoDB client and connection lifecycle."""

    def __init__(self) -> None:
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None

    async def connect(self, mongo_url: Optional[str] = None, db_name: Optional[str] = None) -> None:
        """Establish connection to MongoDB and prepare database handle."""
        url = mongo_url or settings.MONGO_URL
        name = db_name or settings.MONGO_DB
        logger.info(f"Connecting to MongoDB at {url.split('@')[-1] if '@' in url else url} (database: {name})")
        self.client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=5000)
        self.db = self.client[name]

    async def close(self) -> None:
        """Close MongoDB connection gracefully."""
        if self.client is not None:
            self.client.close()
            logger.info("MongoDB connection closed.")
            self.client = None
            self.db = None

    async def create_indexes(self) -> None:
        """Create required indexes including 2dsphere geospatial and unique indexes."""
        if self.db is None:
            raise RuntimeError("Database connection is not initialized")

        # 1. neighborhoods.boundary 2dsphere
        await self.db.neighborhoods.create_index(
            [("boundary", "2dsphere")],
            name="idx_neighborhoods_boundary_2dsphere"
        )
        logger.info("Index created: neighborhoods.boundary 2dsphere")

        # 2. user_locations.location 2dsphere with partialFilterExpression
        # Crucial: allows documents without 'location' field while preserving 2dsphere on valid points
        await self.db.user_locations.create_index(
            [("location", "2dsphere")],
            name="idx_user_locations_location_2dsphere",
            partialFilterExpression={"location": {"$exists": True}}
        )
        logger.info("Index created: user_locations.location 2dsphere (partial)")

        # 3. user_locations.user_id unique
        await self.db.user_locations.create_index(
            [("user_id", 1)],
            name="idx_user_locations_user_id_unique",
            unique=True
        )
        logger.info("Index created: user_locations.user_id unique")

        # 4. meeting_points.location 2dsphere
        await self.db.meeting_points.create_index(
            [("location", "2dsphere")],
            name="idx_meeting_points_location_2dsphere"
        )
        logger.info("Index created: meeting_points.location 2dsphere")

        # 5. trust_circles.owner_id and compound (owner_id, level) unique for upsert
        await self.db.trust_circles.create_index(
            [("owner_id", 1)],
            name="idx_trust_circles_owner_id"
        )
        await self.db.trust_circles.create_index(
            [("owner_id", 1), ("level", 1)],
            name="idx_trust_circles_owner_level_unique",
            unique=True
        )
        logger.info("Indexes created: trust_circles")

        # 6. address_verifications user_id
        await self.db.address_verifications.create_index(
            [("user_id", 1)],
            name="idx_address_verifications_user_id"
        )
        logger.info("Index created: address_verifications.user_id")

    async def is_healthy(self) -> bool:
        """Check if MongoDB is reachable with ping command."""
        if self.client is None or self.db is None:
            return False
        try:
            await self.client.admin.command("ping")
            return True
        except Exception as e:
            logger.warning(f"MongoDB health ping failed: {e}")
            return False


db_manager = DatabaseManager()


async def get_db() -> AsyncIOMotorDatabase:
    """Dependency provider for FastAPI routes to access database."""
    if db_manager.db is None:
        raise RuntimeError("Database is not connected")
    return db_manager.db
