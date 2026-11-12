from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.events.publisher import event_publisher
from app.models.verification import (
    AddressValidationActionResponse,
    AddressVerificationRequest,
    AddressVerificationResponse,
)
from app.security import get_current_user, UserTokenPayload
from app.services.verification_service import VerificationService

router = APIRouter(tags=["Addresses"])


@router.post(
    "/addresses/verify",
    response_model=AddressVerificationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Initiate an address verification"
)
async def request_address_verification(
    payload: AddressVerificationRequest,
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> AddressVerificationResponse:
    """Start an address verification process using postal code, document, or neighbor validation."""
    return await VerificationService.create_verification(
        db=db,
        user_id=current_user.user_id,
        payload=payload
    )


@router.post(
    "/addresses/{id}/validate",
    response_model=AddressValidationActionResponse,
    summary="Neighbor validates an address verification request"
)
async def validate_neighbor_address(
    id: str,
    current_user: UserTokenPayload = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> AddressValidationActionResponse:
    """
    Validate a neighbor's address.
    - Prevents validating own address (400 Bad Request)
    - Prevents duplicate validations (400 Bad Request)
    - If threshold reached, status transitions to 'verified' and emits geo.address_verified
    """
    try:
        response, event_data = await VerificationService.validate_by_neighbor(
            db=db,
            verification_id=id,
            validator_user_id=current_user.user_id
        )

        # Publish geo.address_verified event if verification threshold is reached
        if event_data:
            await event_publisher.publish_event(
                routing_key="geo.address_verified",
                data=event_data
            )

        return response
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Address verification {id} not found"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
