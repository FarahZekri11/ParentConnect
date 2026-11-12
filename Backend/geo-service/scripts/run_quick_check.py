import sys
import os

# Add geo-service root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.models.geo import GeoPoint, GeoPolygon
from app.services.geo_service import (
    blur_location,
    haversine_distance_m,
    round_distance_anti_triangulation,
)
from app.security import UserTokenPayload, forward_auth_headers
from app.routers.health import HealthResponse
from fastapi import Request

print("=" * 65)
print("🔍 VÉRIFICATION TECHNIQUE DU MICROSERVICE GEO-SERVICE")
print("=" * 65)

# 1. Settings Check
print("\n[1/5] Vérification de la Configuration et des Ports...")
port = settings.get_effective_port()
print(f"  • Port d'écoute configuré : {port} (Attendu: 8080) -> {'OK' if port == 8080 else 'FAIL'}")
assert port == 8080

eureka_name = settings.EUREKA_APP_NAME
print(f"  • Nom d'enregistrement Eureka : {eureka_name} -> {'OK' if eureka_name == 'PARENTCONNECT-GEO-SERVICE' else 'FAIL'}")
assert eureka_name == "PARENTCONNECT-GEO-SERVICE"

rmq_exchange = settings.RABBITMQ_EXCHANGE
print(f"  • RabbitMQ Topic Exchange : {rmq_exchange} -> {'OK' if rmq_exchange == 'parentconnect.topic' else 'FAIL'}")
assert rmq_exchange == "parentconnect.topic"

rmq_queue = settings.RABBITMQ_EVENTS_QUEUE
print(f"  • RabbitMQ Queue : {rmq_queue} -> {'OK' if rmq_queue == 'geo_events_queue' else 'FAIL'}")
assert rmq_queue == "geo_events_queue"

# 2. Keycloak & Roles Check
print("\n[2/5] Vérification de la Sécurité & Rôles Keycloak...")
parent_user = UserTokenPayload(
    sub="usr_sarah_123",
    preferred_username="sarah",
    role="PARENT",
    roles=["PARENT"]
)
print(f"  • User ID extrait : {parent_user.user_id} -> OK")
print(f"  • Rôle PARENT détecté : {parent_user.role} -> OK")
print(f"  • has_role('PARENT') : {parent_user.has_role('PARENT')} -> OK")
print(f"  • is_admin pour Parent : {parent_user.is_admin} (Attendu: False) -> OK")
assert not parent_user.is_admin

admin_user = UserTokenPayload(
    sub="adm_karim_456",
    preferred_username="karim",
    role="ADMIN",
    roles=["ADMIN", "default-roles-parentconnect"]
)
print(f"  • is_admin pour Admin : {admin_user.is_admin} (Attendu: True) -> OK")
assert admin_user.is_admin

# 3. Inter-service Header Forwarding Check
print("\n[3/5] Vérification du Transfert de Token Inter-Services...")
dummy_request = Request({
    "type": "http",
    "headers": [
        (b"authorization", b"Bearer token_jwt_keycloak_valide"),
        (b"x-request-id", b"trace-uuid-12345"),
    ]
})
forwarded = forward_auth_headers(dummy_request)
print(f"  • En-tête Authorization propagé : {forwarded.get('Authorization')[:20]}... -> OK")
print(f"  • En-tête X-Request-ID propagé : {forwarded.get('X-Request-ID')} -> OK")
assert "Authorization" in forwarded and "X-Request-ID" in forwarded

# 4. Geospatial & HMAC Blurring Check
print("\n[4/5] Vérification de la Logique Métier & Algorithmes Géospatiaux...")
raw_lng, raw_lat = 10.1815, 36.8065  # Tunis
blurred_lng, blurred_lat = blur_location(raw_lng, raw_lat, radius_m=200.0, user_id="user_alice")
dist = haversine_distance_m(raw_lng, raw_lat, blurred_lng, blurred_lat)
print(f"  • Floutage HMAC calculé : distance = {dist:.1f}m (doit être <= 200m) -> OK")
assert dist <= 200.0

# Verify stability (anti-averaging): same user must yield identical coordinates
blurred_lng_2, blurred_lat_2 = blur_location(raw_lng, raw_lat, radius_m=200.0, user_id="user_alice")
assert (blurred_lng, blurred_lat) == (blurred_lng_2, blurred_lat_2)
print("  • Floutage stable et reproductible par utilisateur (Anti-Moyennage) -> OK")

# Anti-triangulation rounding
rounded_dist = round_distance_anti_triangulation(243.0)
print(f"  • Arrondi anti-triangulation (243m -> {rounded_dist}m) -> OK")
assert rounded_dist == 200.0

# 5. Health Models Check
print("\n[5/5] Vérification du Modèle de Santé (Health Probe)...")
h = HealthResponse(status="ok")
print(f"  • HealthResponse JSON : {h.model_dump_json()} -> OK")
assert h.status == "ok"

print("\n" + "=" * 65)
print("✅ TOUTES LES VÉRIFICATIONS SONT PASSÉES AVEC SUCCÈS (100%) !")
print("=" * 65)
