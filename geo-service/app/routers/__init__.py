from fastapi import APIRouter
from app.routers.neighborhoods import router as neighborhoods_router
from app.routers.locations import router as locations_router
from app.routers.addresses import router as addresses_router
from app.routers.circles import router as circles_router
from app.routers.meeting_points import router as meeting_points_router
from app.routers.internal import router as internal_router
from app.routers.health import router as health_router

# Combine public routes under public_router
public_router = APIRouter()
public_router.include_router(neighborhoods_router)
public_router.include_router(locations_router)
public_router.include_router(addresses_router)
public_router.include_router(circles_router)
public_router.include_router(meeting_points_router)

__all__ = [
    "public_router",
    "internal_router",
    "health_router",
]
