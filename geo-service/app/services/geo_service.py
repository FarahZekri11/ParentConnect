import hashlib
import hmac
import math
import secrets
from typing import List, Optional, Tuple
from app.config import settings


def haversine_distance_m(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    """
    Calculate the great circle distance between two points in meters using Haversine formula.
    Coordinates are in decimal degrees.
    """
    earth_radius_m = 6371000.0  # Earth mean radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return earth_radius_m * c


def blur_location(
    lng: float,
    lat: float,
    radius_m: Optional[float] = None,
    user_id: Optional[str] = None,
    salt: Optional[str] = None
) -> Tuple[float, float]:
    """
    Apply a geospatial blur within radius_m meters.
    
    If user_id is provided, the offset is stably derived using HMAC-SHA256,
    preventing averaging attacks from repeated updates.
    If user_id is None, a cryptographically secure random offset is generated.
    
    Conversion formula:
    - 1 deg latitude ≈ 111,000 meters
    - 1 deg longitude ≈ 111,000 * cos(latitude) meters
    Uniform disk sampling ensures unbiased spatial dispersion.
    """
    max_radius = radius_m if radius_m is not None else settings.LOCATION_BLUR_M
    secret_salt = salt if salt is not None else settings.BLUR_SALT

    if user_id:
        # Deterministic stable pseudo-random offset via HMAC-SHA256
        key = secret_salt.encode("utf-8")
        msg = f"blur:{user_id}".encode("utf-8")
        h = hmac.new(key, msg, hashlib.sha256).digest()

        # Split 32 bytes into two 64-bit integers for angle and radius
        seed_angle = int.from_bytes(h[:8], byteorder="big")
        seed_radius = int.from_bytes(h[8:16], byteorder="big")

        u_angle = (seed_angle % 1_000_000) / 1_000_000.0
        u_radius = ((seed_radius % 1_000_000) + 1) / 1_000_000.0  # strictly > 0
    else:
        # Dynamic secure random offset
        sys_rand = secrets.SystemRandom()
        u_angle = sys_rand.random()
        u_radius = sys_rand.uniform(0.01, 1.0)

    # Uniform circular distribution: r = max_radius * sqrt(u)
    angle = 2.0 * math.pi * u_angle
    r = max_radius * math.sqrt(u_radius)

    dx = r * math.cos(angle)
    dy = r * math.sin(angle)

    # Geodesic translation in degrees
    meters_per_deg_lat = 111000.0
    lat_rad = math.radians(lat)
    cos_lat = math.cos(lat_rad)
    # Guard against division by near-zero at extreme poles
    if abs(cos_lat) < 1e-6:
        cos_lat = 1e-6
    meters_per_deg_lng = 111000.0 * cos_lat

    dlat = dy / meters_per_deg_lat
    dlng = dx / meters_per_deg_lng

    blurred_lng = round(lng + dlng, 6)
    blurred_lat = round(lat + dlat, 6)

    # Clamp values to valid geographical boundaries
    blurred_lng = max(-180.0, min(180.0, blurred_lng))
    blurred_lat = max(-90.0, min(90.0, blurred_lat))

    return blurred_lng, blurred_lat


def round_distance_anti_triangulation(distance_m: float) -> float:
    """
    Round public distance to nearest 100 meters to prevent trilateration / triangulation.
    """
    return float(round(distance_m / 100.0) * 100.0)
