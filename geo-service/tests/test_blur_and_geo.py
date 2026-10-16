import pytest
from pydantic import ValidationError
from app.models.geo import GeoPoint, GeoPolygon
from app.services.geo_service import (
    blur_location,
    haversine_distance_m,
    round_distance_anti_triangulation,
)


def test_haversine_distance_same_point():
    """Distance between a point and itself should be 0 meters."""
    dist = haversine_distance_m(10.1815, 36.8065, 10.1815, 36.8065)
    assert round(dist, 4) == 0.0


def test_haversine_distance_known_points():
    """Test distance between Tunis center and Carthage (~13-14km)."""
    # Tunis center: (10.1815, 36.8065), Carthage: (10.3238, 36.8528)
    dist = haversine_distance_m(10.1815, 36.8065, 10.3238, 36.8528)
    assert 13000 <= dist <= 14500


def test_blur_location_distance_within_radius():
    """The distance between raw point and blurred point must never exceed radius_m."""
    raw_lng, raw_lat = 10.1815, 36.8065
    radius = 200.0

    for i in range(50):
        blurred_lng, blurred_lat = blur_location(
            lng=raw_lng,
            lat=raw_lat,
            radius_m=radius
        )
        dist = haversine_distance_m(raw_lng, raw_lat, blurred_lng, blurred_lat)
        # Small tolerance (1m) due to spherical math vs flat approximations
        assert dist <= radius + 1.5, f"Blurred distance {dist} exceeded radius {radius}"


def test_blur_location_stable_hmac():
    """The HMAC-based blur must produce identical coordinates for the same user_id."""
    raw_lng, raw_lat = 10.1815, 36.8065
    uid = "user_stable_test_123"

    res1 = blur_location(raw_lng, raw_lat, radius_m=200.0, user_id=uid)
    res2 = blur_location(raw_lng, raw_lat, radius_m=200.0, user_id=uid)
    res3 = blur_location(raw_lng, raw_lat, radius_m=200.0, user_id=uid)

    assert res1 == res2 == res3, "Stable blur must be deterministic for the same user_id"

    # Different user must receive different offset
    res_other = blur_location(raw_lng, raw_lat, radius_m=200.0, user_id="user_stable_test_456")
    assert res1 != res_other, "Different users must receive different offsets"


def test_round_distance_anti_triangulation():
    """Anti-triangulation rounding must round to nearest 100 meters."""
    assert round_distance_anti_triangulation(42.0) == 0.0
    assert round_distance_anti_triangulation(51.0) == 100.0
    assert round_distance_anti_triangulation(149.9) == 100.0
    assert round_distance_anti_triangulation(150.0) == 200.0
    assert round_distance_anti_triangulation(342.7) == 300.0
    assert round_distance_anti_triangulation(880.0) == 900.0


def test_geopoint_validation_valid():
    """Valid coordinates must instantiate without error."""
    pt = GeoPoint(type="Point", coordinates=(10.1815, 36.8065))
    assert pt.longitude == 10.1815
    assert pt.latitude == 36.8065


def test_geopoint_validation_invalid_bounds():
    """Coordinates out of geographical bounds must raise ValidationError (422)."""
    with pytest.raises(ValidationError):
        # Longitude > 180
        GeoPoint(type="Point", coordinates=(185.0, 36.8065))

    with pytest.raises(ValidationError):
        # Latitude < -90
        GeoPoint(type="Point", coordinates=(10.1815, -95.0))


def test_geopolygon_validation():
    """Polygons must be closed and contain at least 4 coordinates."""
    # Valid closed polygon
    valid_coords = [[[10.0, 36.0], [10.1, 36.0], [10.1, 36.1], [10.0, 36.1], [10.0, 36.0]]]
    poly = GeoPolygon(type="Polygon", coordinates=valid_coords)
    assert len(poly.coordinates[0]) == 5

    # Unclosed polygon must fail
    unclosed_coords = [[[10.0, 36.0], [10.1, 36.0], [10.1, 36.1], [10.0, 36.1]]]
    with pytest.raises(ValidationError):
        GeoPolygon(type="Polygon", coordinates=unclosed_coords)
