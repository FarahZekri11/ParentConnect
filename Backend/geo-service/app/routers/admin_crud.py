"""
CRUD complémentaire de la géolocalisation :
  PUT/DELETE /api/geo/neighborhoods/{id}     (ADMIN)
  PUT/DELETE /api/geo/meeting-points/{id}    (ADMIN)
  DELETE     /api/geo/locations/me           (l'utilisateur retire sa position approximative)
  GET        /api/geo/admin/stats            (ADMIN, compteurs réels)

Aucune position exacte n'est stockée : seules les positions floutées (~200 m) existent en base.
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.models.meeting_point import MeetingPointResponse, MeetingPointUpdate
from app.models.neighborhood import NeighborhoodCreate, NeighborhoodResponse
from app.security import UserTokenPayload, get_current_user, require_admin
from app.services.meeting_point_service import MeetingPointService
from app.services.neighborhood_service import NeighborhoodService

router = APIRouter(tags=["Administration géographique"])


def _object_id(value: str, label: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} introuvable")
    return ObjectId(value)


@router.put("/neighborhoods/{neighborhood_id}", response_model=NeighborhoodResponse,
            summary="Modifier un quartier (ADMIN)")
async def update_neighborhood(
    neighborhood_id: str,
    payload: NeighborhoodCreate,
    admin: UserTokenPayload = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> NeighborhoodResponse:
    oid = _object_id(neighborhood_id, "Quartier")
    result = await db.neighborhoods.update_one({"_id": oid}, {"$set": {
        "name": payload.name,
        "city": payload.city,
        "boundary": payload.boundary.model_dump(),
        "center": payload.center.model_dump(),
        "updated_at": datetime.now(timezone.utc),
    }})
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quartier introuvable")
    return await NeighborhoodService.get_by_id(db, neighborhood_id)


@router.delete("/neighborhoods/{neighborhood_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Supprimer un quartier (ADMIN)")
async def delete_neighborhood(
    neighborhood_id: str,
    admin: UserTokenPayload = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    oid = _object_id(neighborhood_id, "Quartier")
    result = await db.neighborhoods.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quartier introuvable")
    # Les points de rencontre du quartier disparaissent avec lui ; les positions des parents sont
    # conservées mais ne sont plus rattachées à ce quartier.
    await db.meeting_points.delete_many({"neighborhood_id": neighborhood_id})
    await db.user_locations.update_many({"neighborhood_id": neighborhood_id}, {"$set": {"neighborhood_id": None}})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/meeting-points/{point_id}", response_model=MeetingPointResponse,
            summary="Modifier un point de rencontre (ADMIN)")
async def update_meeting_point(
    point_id: str,
    payload: MeetingPointUpdate,
    admin: UserTokenPayload = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MeetingPointResponse:
    oid = _object_id(point_id, "Point de rencontre")
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "location" in changes:
        changes["location"] = payload.location.model_dump()
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aucune modification fournie")
    doc = await db.meeting_points.find_one_and_update({"_id": oid}, {"$set": changes}, return_document=True)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Point de rencontre introuvable")
    return MeetingPointService._doc_to_response(doc)


@router.delete("/meeting-points/{point_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Supprimer un point de rencontre (ADMIN)")
async def delete_meeting_point(
    point_id: str,
    admin: UserTokenPayload = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    oid = _object_id(point_id, "Point de rencontre")
    result = await db.meeting_points.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Point de rencontre introuvable")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/locations/me", status_code=status.HTTP_204_NO_CONTENT,
               summary="Retirer ma position approximative")
async def delete_my_location(
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    """Retrait du consentement : la position floutée est supprimée (le parent n'apparaît plus à proximité)."""
    result = await db.user_locations.delete_one({"user_id": current_user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucune position enregistrée")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/stats", summary="Statistiques de la géolocalisation (ADMIN)")
async def geo_stats(
    admin: UserTokenPayload = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    return {
        "neighborhoods": await db.neighborhoods.count_documents({}),
        "meeting_points": await db.meeting_points.count_documents({}),
        "located_users": await db.user_locations.count_documents({}),
        "located_users_in_neighborhood": await db.user_locations.count_documents({"neighborhood_id": {"$ne": None}}),
    }
