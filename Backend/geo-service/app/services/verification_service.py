from datetime import datetime, timezone
from typing import Optional, Tuple
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.config import settings
from app.models.verification import (
    AddressValidationActionResponse,
    AddressVerificationRequest,
    AddressVerificationResponse,
)


class VerificationService:
    """Business logic for parent address verifications and neighbor peer validation."""

    @staticmethod
    def _doc_to_response(doc: dict) -> AddressVerificationResponse:
        return AddressVerificationResponse(
            id=str(doc["_id"]),
            user_id=doc["user_id"],
            method=doc["method"],
            status=doc["status"],
            validated_by=doc.get("validated_by", []),
            created_at=doc.get("created_at", datetime.now(timezone.utc)),
            updated_at=doc.get("updated_at", datetime.now(timezone.utc))
        )

    @classmethod
    async def create_verification(
        cls, db: AsyncIOMotorDatabase, user_id: str, payload: AddressVerificationRequest
    ) -> AddressVerificationResponse:
        """Initiate an address verification process."""
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "method": payload.method,
            "status": "pending",
            "validated_by": [],
            "created_at": now,
            "updated_at": now
        }
        res = await db.address_verifications.insert_one(doc)
        doc["_id"] = res.inserted_id
        return cls._doc_to_response(doc)

    @classmethod
    async def get_by_id(
        cls, db: AsyncIOMotorDatabase, verification_id: str
    ) -> Optional[AddressVerificationResponse]:
        """Fetch verification details by its ID."""
        if not ObjectId.is_valid(verification_id):
            return None
        doc = await db.address_verifications.find_one({"_id": ObjectId(verification_id)})
        if not doc:
            return None
        return cls._doc_to_response(doc)

    @classmethod
    async def validate_by_neighbor(
        cls, db: AsyncIOMotorDatabase, verification_id: str, validator_user_id: str
    ) -> Tuple[AddressValidationActionResponse, Optional[dict]]:
        """
        Neighbor validates another parent's address.
        - Rules:
          - Forbidden to validate own address.
          - No duplicate validations from the same neighbor.
          - When threshold reached: status -> 'verified', updates user_locations.verified = True,
            and returns event payload {user_id, neighborhood_id} to publish geo.address_verified.
        """
        if not ObjectId.is_valid(verification_id):
            raise KeyError("Verification not found")

        doc = await db.address_verifications.find_one({"_id": ObjectId(verification_id)})
        if not doc:
            raise KeyError("Verification not found")

        target_user_id = doc["user_id"]
        # Rule: Cannot validate own address
        if target_user_id == validator_user_id:
            raise ValueError("You cannot validate your own address verification")

        validated_by = list(doc.get("validated_by", []))
        # Rule: No duplicate validations
        if validator_user_id in validated_by:
            raise ValueError("You have already validated this address verification")

        validated_by.append(validator_user_id)
        validations_count = len(validated_by)
        threshold = settings.ADDRESS_VERIFICATION_THRESHOLD

        is_verified = validations_count >= threshold
        new_status = "verified" if is_verified else doc["status"]
        now = datetime.now(timezone.utc)

        await db.address_verifications.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "validated_by": validated_by,
                    "status": new_status,
                    "updated_at": now
                }
            }
        )

        event_data = None
        if is_verified and doc["status"] != "verified":
            # Update user_locations verified flag
            await db.user_locations.update_one(
                {"user_id": target_user_id},
                {"$set": {"verified": True, "updated_at": now}}
            )
            # Find user's neighborhood for event payload
            user_loc = await db.user_locations.find_one({"user_id": target_user_id})
            neighborhood_id = user_loc.get("neighborhood_id") if user_loc else None
            event_data = {
                "user_id": target_user_id,
                "neighborhood_id": neighborhood_id
            }

        action_response = AddressValidationActionResponse(
            id=str(doc["_id"]),
            status=new_status,
            validations_count=validations_count,
            required_validations=threshold,
            is_fully_verified=is_verified,
            message="Address successfully verified!" if is_verified else f"Validation recorded ({validations_count}/{threshold} required)"
        )

        return action_response, event_data
