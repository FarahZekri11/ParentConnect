from datetime import datetime, timezone, timedelta
import os
import sys
from typing import AsyncGenerator, Dict

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from motor.motor_asyncio import AsyncIOMotorClient

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.database import db_manager
from app.main import app

# Test configuration
TEST_JWT_SECRET = "super-test-secret-hs256-key-32ch-min"
TEST_INTERNAL_KEY = "test-internal-api-key"
TEST_MONGO_URL = os.getenv("TEST_MONGO_URL", "mongodb://localhost:27017")
TEST_DB_NAME = "geo_test_db"


@pytest.fixture(scope="session", autouse=True)
def configure_test_settings():
    """Configure settings for test execution."""
    settings.JWT_ALGORITHM = "HS256"
    settings.JWT_SECRET = TEST_JWT_SECRET
    settings.INTERNAL_API_KEY = TEST_INTERNAL_KEY
    settings.MONGO_URL = TEST_MONGO_URL
    settings.MONGO_DB = TEST_DB_NAME
    settings.LOCATION_BLUR_M = 200.0
    settings.BLUR_SALT = "test-blur-salt"
    settings.ADDRESS_VERIFICATION_THRESHOLD = 2


def create_token(user_id: str, role: str = "USER", expires_in_minutes: int = 60) -> str:
    """Helper to generate a valid test JWT token."""
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


@pytest.fixture
def user_alice_token() -> str:
    return create_token("user_alice", role="USER")


@pytest.fixture
def user_bob_token() -> str:
    return create_token("user_bob", role="USER")


@pytest.fixture
def admin_token() -> str:
    return create_token("user_admin", role="ADMIN")


@pytest.fixture
def expired_token() -> str:
    return create_token("user_alice", role="USER", expires_in_minutes=-10)


@pytest.fixture
def internal_headers() -> Dict[str, str]:
    return {"X-Internal-Key": TEST_INTERNAL_KEY}


@pytest_asyncio.fixture
async def test_db():
    """Provide a fresh MongoDB test database instance for each test."""
    client = AsyncIOMotorClient(TEST_MONGO_URL)
    db = client[TEST_DB_NAME]
    db_manager.client = client
    db_manager.db = db

    # Create indexes
    await db_manager.create_indexes()

    yield db

    # Clean collections after test
    collections = await db.list_collection_names()
    for col in collections:
        if not col.startswith("system."):
            await db[col].delete_many({})
    client.close()


@pytest_asyncio.fixture
async def client(test_db) -> AsyncGenerator[AsyncClient, None]:
    """Provide an HTTPX AsyncClient with active test database."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
