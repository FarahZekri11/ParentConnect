from pydantic import BaseModel, Field


class UserWithinResponse(BaseModel):
    """
    Contract for inter-service queries (/internal/geo/users-within).
    Called by Marketplace, Babysitting, and Events services.
    Preserves exact distance in meters (unrounded).
    """
    user_id: str = Field(
        ...,
        description="Unique identifier of the matching parent",
        examples=["user_12345abc"]
    )
    distance_m: float = Field(
        ...,
        description="Exact distance in meters from center coordinates (unrounded for precise matching)",
        examples=[342.75]
    )


class DistanceBetweenUsersResponse(BaseModel):
    """
    Contract for direct distance query between two users (/internal/geo/distance).
    Called by Babysitting and Marketplace services.
    """
    userA: str = Field(..., description="First user identifier", examples=["usr_alice_123"])
    userB: str = Field(..., description="Second user identifier", examples=["usr_bob_456"])
    distance_m: float = Field(
        ...,
        description="Exact distance in meters between both parents' locations",
        examples=[1250.4]
    )
