from typing import List, Literal, Tuple
from pydantic import BaseModel, Field, field_validator


class GeoPoint(BaseModel):
    """GeoJSON Point geometry [longitude, latitude]."""
    type: Literal["Point"] = "Point"
    coordinates: Tuple[float, float] = Field(
        ...,
        description="Coordinates in [longitude, latitude] order (LNG first, LAT second)",
        examples=[[10.1815, 36.8065]]
    )

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v: Tuple[float, float]) -> Tuple[float, float]:
        lng, lat = v
        if not (-180.0 <= lng <= 180.0):
            raise ValueError(f"Longitude {lng} must be between -180 and 180 degrees")
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude {lat} must be between -90 and 90 degrees")
        return v

    @property
    def longitude(self) -> float:
        return self.coordinates[0]

    @property
    def latitude(self) -> float:
        return self.coordinates[1]


class GeoPolygon(BaseModel):
    """GeoJSON Polygon geometry with closed linear ring."""
    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[Tuple[float, float]]] = Field(
        ...,
        description="Array of linear rings. First ring is exterior boundary. Coordinates [lng, lat].",
        examples=[[[[10.17, 36.80], [10.19, 36.80], [10.19, 36.82], [10.17, 36.82], [10.17, 36.80]]]]
    )

    @field_validator("coordinates")
    @classmethod
    def validate_polygon_coordinates(
        cls, v: List[List[Tuple[float, float]]]
    ) -> List[List[Tuple[float, float]]]:
        if not v or len(v) < 1:
            raise ValueError("Polygon must contain at least one linear ring")
        for ring in v:
            if len(ring) < 4:
                raise ValueError("Each linear ring must contain at least 4 positions")
            # Closed ring verification: first point == last point
            first = ring[0]
            last = ring[-1]
            if abs(first[0] - last[0]) > 1e-7 or abs(first[1] - last[1]) > 1e-7:
                raise ValueError("Linear ring must be closed (first and last coordinate identical)")
            for lng, lat in ring:
                if not (-180.0 <= lng <= 180.0):
                    raise ValueError(f"Longitude {lng} must be between -180 and 180")
                if not (-90.0 <= lat <= 90.0):
                    raise ValueError(f"Latitude {lat} must be between -90 and 90")
        return v
