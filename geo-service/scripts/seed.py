import asyncio
from datetime import datetime, timezone
import os
import sys

# Ensure geo-service root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.services.geo_service import blur_location


async def seed():
    print(f"Connecting to MongoDB at {settings.MONGO_URL} (db: {settings.MONGO_DB})...")
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.MONGO_DB]

    # Clean existing data for clean seed
    await db.neighborhoods.delete_many({})
    await db.user_locations.delete_many({})
    await db.meeting_points.delete_many({})
    await db.trust_circles.delete_many({})
    await db.address_verifications.delete_many({})
    await db.processed_events.delete_many({})

    print("Cleared existing collections.")

    # 1. Seed Neighborhoods (Tunis area)
    neighborhoods_data = [
        {
            "name": "Lafayette",
            "city": "Tunis",
            "center": {"type": "Point", "coordinates": [10.1815, 36.8065]},
            "boundary": {
                "type": "Polygon",
                "coordinates": [[
                    [10.1750, 36.8020],
                    [10.1880, 36.8020],
                    [10.1880, 36.8120],
                    [10.1750, 36.8120],
                    [10.1750, 36.8020]
                ]]
            },
            "created_at": datetime.now(timezone.utc)
        },
        {
            "name": "Mutuelleville",
            "city": "Tunis",
            "center": {"type": "Point", "coordinates": [10.1700, 36.8280]},
            "boundary": {
                "type": "Polygon",
                "coordinates": [[
                    [10.1600, 36.8200],
                    [10.1800, 36.8200],
                    [10.1800, 36.8360],
                    [10.1600, 36.8360],
                    [10.1600, 36.8200]
                ]]
            },
            "created_at": datetime.now(timezone.utc)
        },
        {
            "name": "Centre Ville",
            "city": "Tunis",
            "center": {"type": "Point", "coordinates": [10.1790, 36.7990]},
            "boundary": {
                "type": "Polygon",
                "coordinates": [[
                    [10.1700, 36.7920],
                    [10.1900, 36.7920],
                    [10.1900, 36.8020],
                    [10.1700, 36.8020],
                    [10.1700, 36.7920]
                ]]
            },
            "created_at": datetime.now(timezone.utc)
        },
        {
            "name": "Ennasr 2",
            "city": "Ariana",
            "center": {"type": "Point", "coordinates": [10.1550, 36.8620]},
            "boundary": {
                "type": "Polygon",
                "coordinates": [[
                    [10.1450, 36.8520],
                    [10.1650, 36.8520],
                    [10.1650, 36.8720],
                    [10.1450, 36.8720],
                    [10.1450, 36.8520]
                ]]
            },
            "created_at": datetime.now(timezone.utc)
        }
    ]

    inserted_neighborhoods = {}
    for nh in neighborhoods_data:
        res = await db.neighborhoods.insert_one(nh)
        inserted_neighborhoods[nh["name"]] = str(res.inserted_id)
        print(f"  Inserted neighborhood: {nh['name']} ({res.inserted_id})")

    # 2. Seed Safe Meeting Points
    meeting_points = [
        {
            "neighborhood_id": inserted_neighborhoods["Lafayette"],
            "name": "Jardin du Passage",
            "type": "park",
            "location": {"type": "Point", "coordinates": [10.1820, 36.8080]}
        },
        {
            "neighborhood_id": inserted_neighborhoods["Lafayette"],
            "name": "Mairie d'Arrondissement Lafayette",
            "type": "town_hall",
            "location": {"type": "Point", "coordinates": [10.1800, 36.8050]}
        },
        {
            "neighborhood_id": inserted_neighborhoods["Mutuelleville"],
            "name": "Parc du Belvédère (Porte Est)",
            "type": "park",
            "location": {"type": "Point", "coordinates": [10.1710, 36.8250]}
        },
        {
            "neighborhood_id": inserted_neighborhoods["Mutuelleville"],
            "name": "Crèche Les Petits Dauphins",
            "type": "daycare",
            "location": {"type": "Point", "coordinates": [10.1680, 36.8290]}
        },
        {
            "neighborhood_id": inserted_neighborhoods["Centre Ville"],
            "name": "Esplanade Habib Bourguiba",
            "type": "park",
            "location": {"type": "Point", "coordinates": [10.1850, 36.7995]}
        },
        {
            "neighborhood_id": inserted_neighborhoods["Ennasr 2"],
            "name": "Jardin Public Ennasr",
            "type": "park",
            "location": {"type": "Point", "coordinates": [10.1560, 36.8630]}
        }
    ]
    await db.meeting_points.insert_many(meeting_points)
    print(f"Inserted {len(meeting_points)} meeting points.")

    # 3. Seed ~20 Fictitious Parents with Stable Blurred Locations
    parents_base = [
        # Lafayette parents (6)
        ("user_lafayette_01", 10.1800, 36.8050, "Lafayette", True),
        ("user_lafayette_02", 10.1820, 36.8070, "Lafayette", True),
        ("user_lafayette_03", 10.1780, 36.8090, "Lafayette", False),
        ("user_lafayette_04", 10.1850, 36.8040, "Lafayette", True),
        ("user_lafayette_05", 10.1830, 36.8100, "Lafayette", False),
        ("user_lafayette_06", 10.1760, 36.8030, "Lafayette", True),
        # Mutuelleville parents (6)
        ("user_mutuelle_01", 10.1680, 36.8260, "Mutuelleville", True),
        ("user_mutuelle_02", 10.1720, 36.8300, "Mutuelleville", True),
        ("user_mutuelle_03", 10.1650, 36.8230, "Mutuelleville", False),
        ("user_mutuelle_04", 10.1750, 36.8320, "Mutuelleville", True),
        ("user_mutuelle_05", 10.1690, 36.8340, "Mutuelleville", False),
        ("user_mutuelle_06", 10.1710, 36.8210, "Mutuelleville", True),
        # Centre Ville parents (5)
        ("user_centre_01", 10.1780, 36.7980, "Centre Ville", True),
        ("user_centre_02", 10.1830, 36.7960, "Centre Ville", True),
        ("user_centre_03", 10.1750, 36.8000, "Centre Ville", False),
        ("user_centre_04", 10.1870, 36.7950, "Centre Ville", True),
        ("user_centre_05", 10.1810, 36.8010, "Centre Ville", False),
        # Ennasr parents (3)
        ("user_ennasr_01", 10.1540, 36.8610, "Ennasr 2", True),
        ("user_ennasr_02", 10.1580, 36.8640, "Ennasr 2", True),
        ("user_ennasr_03", 10.1510, 36.8580, "Ennasr 2", False),
    ]

    now = datetime.now(timezone.utc)
    user_locations_to_insert = []
    for uid, raw_lng, raw_lat, nh_name, verified in parents_base:
        blurred_lng, blurred_lat = blur_location(
            lng=raw_lng,
            lat=raw_lat,
            radius_m=200.0,
            user_id=uid,
            salt=settings.BLUR_SALT
        )
        user_locations_to_insert.append({
            "user_id": uid,
            "location": {"type": "Point", "coordinates": [blurred_lng, blurred_lat]},
            "neighborhood_id": inserted_neighborhoods[nh_name],
            "precision_m": 200.0,
            "verified": verified,
            "updated_at": now
        })

    await db.user_locations.insert_many(user_locations_to_insert)
    print(f"Inserted {len(user_locations_to_insert)} parent locations (blurred ~200m).")

    # 4. Seed Trust Circles
    trust_circles = [
        {
            "owner_id": "user_lafayette_01",
            "level": "close",
            "members": ["user_lafayette_02", "user_lafayette_04"],
            "updated_at": now
        },
        {
            "owner_id": "user_lafayette_01",
            "level": "neighborhood",
            "members": ["user_lafayette_02", "user_lafayette_03", "user_lafayette_04", "user_lafayette_06"],
            "updated_at": now
        },
        {
            "owner_id": "user_mutuelle_01",
            "level": "close",
            "members": ["user_mutuelle_02"],
            "updated_at": now
        }
    ]
    await db.trust_circles.insert_many(trust_circles)
    print(f"Inserted {len(trust_circles)} trust circles.")

    client.close()
    print("Seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(seed())
