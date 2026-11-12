from datetime import datetime, timezone
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

VerificationMethod = Literal["postal_code", "document", "neighbor_validation"]
VerificationStatus = Literal["pending", "verified", "rejected"]


class AddressVerificationRequest(BaseModel):
    """Request to initiate an address verification."""
    method: VerificationMethod = Field(
        default="neighbor_validation",
        description="Method used for verification: postal_code, document, or neighbor_validation"
    )


class AddressVerificationResponse(BaseModel):
    """Address verification status response."""
    id: str
    user_id: str
    method: VerificationMethod
    status: VerificationStatus
    validated_by: List[str]
    created_at: datetime
    updated_at: datetime


class AddressValidationActionResponse(BaseModel):
    """Response after a neighbor validates an address."""
    id: str
    status: VerificationStatus
    validations_count: int
    required_validations: int
    is_fully_verified: bool
    message: str
