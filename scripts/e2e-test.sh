#!/usr/bin/env bash
# =====================================================================
# Test de bout en bout ParentConnect (Event Service + Participation Service)
# Prérequis : pile démarrée avec "docker compose up -d --build" et SPRING_PROFILES_ACTIVE=dev
# Usage     : ./scripts/e2e-test.sh
# Dépendances : bash, curl (aucune autre)
# =====================================================================
set -uo pipefail

EVENT_URL="${EVENT_URL:-http://localhost:8085}"
PARTICIPATION_URL="${PARTICIPATION_URL:-http://localhost:8086}"
CONCURRENT_USERS="${CONCURRENT_USERS:-12}"
CAPACITY="${CAPACITY:-4}"

PASS=0
FAIL=0
ok()   { echo "  [OK]   $1"; PASS=$((PASS + 1)); }
ko()   { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
check() { if [ "$2" == "$3" ]; then ok "$1 ($2)"; else ko "$1 : attendu $3, obtenu $2"; fi; }

json_field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" | head -1; }
token() {  # $1 = role, $2 = userId
  curl -s "$EVENT_URL/dev/tokens?role=$1&userId=$2" | json_field accessToken
}
uuid() { cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr 'A-Z' 'a-z'; }
http_code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== Vérification de la disponibilité des services"
check "Event Service health" "$(http_code "$EVENT_URL/actuator/health")" 200
check "Participation Service health" "$(http_code "$PARTICIPATION_URL/actuator/health")" 200
check "Swagger Event Service" "$(http_code "$EVENT_URL/swagger-ui/index.html")" 200
check "Swagger Participation Service" "$(http_code "$PARTICIPATION_URL/swagger-ui/index.html")" 200
check "Sans token -> 401" "$(http_code "$EVENT_URL/api/events")" 401

ORGANIZER=$(uuid)
ORG_TOKEN=$(token PARENT "$ORGANIZER")
[ -n "$ORG_TOKEN" ] || { echo "Impossible d'obtenir un token : le profil 'dev' est-il actif ?"; exit 1; }

echo "== Création d'un événement (capacité $CAPACITY)"
START=$(date -d '+5 days' '+%Y-%m-%dT14:00:00' 2>/dev/null || date -v+5d '+%Y-%m-%dT14:00:00')
END=$(date -d '+5 days' '+%Y-%m-%dT17:00:00' 2>/dev/null || date -v+5d '+%Y-%m-%dT17:00:00')
CREATE=$(curl -s -X POST "$EVENT_URL/api/events" -H "Authorization: Bearer $ORG_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Test E2E\",\"category\":\"ATELIER\",\"startDateTime\":\"$START\",\"endDateTime\":\"$END\",\"city\":\"Lyon\",\"latitude\":45.76,\"longitude\":4.83,\"capacity\":$CAPACITY}")
EVENT_ID=$(echo "$CREATE" | json_field id)
[ -n "$EVENT_ID" ] && ok "Événement créé $EVENT_ID" || { ko "Création : $CREATE"; exit 1; }

echo "== Règles métier"
check "L'organisateur ne peut pas s'inscrire" \
  "$(http_code -X POST "$PARTICIPATION_URL/api/events/$EVENT_ID/join" -H "Authorization: Bearer $ORG_TOKEN")" 409
check "Événement inconnu -> 404" \
  "$(http_code -X POST "$PARTICIPATION_URL/api/events/$(uuid)/join" -H "Authorization: Bearer $(token PARENT "$(uuid)")")" 404

echo "== $CONCURRENT_USERS inscriptions simultanées pour $CAPACITY places"
TMP=$(mktemp -d)
for i in $(seq 1 "$CONCURRENT_USERS"); do
  ( T=$(token PARENT "$(uuid)"); echo "$T" > "$TMP/token_$i"
    echo "$(http_code -X POST "$PARTICIPATION_URL/api/events/$EVENT_ID/join" -H "Authorization: Bearer $T")" > "$TMP/code_$i" ) &
done
wait
SUCCESS=$(cat "$TMP"/code_* | grep -c '^201$')
CONFLICT=$(cat "$TMP"/code_* | grep -c '^409$')
check "Inscriptions acceptées" "$SUCCESS" "$CAPACITY"
check "Inscriptions refusées (complet)" "$CONFLICT" "$((CONCURRENT_USERS - CAPACITY))"
RESERVED=$(curl -s "$EVENT_URL/api/events/$EVENT_ID" -H "Authorization: Bearer $ORG_TOKEN" | json_field reservedPlaces)
check "Places réservées côté Event Service" "$RESERVED" "$CAPACITY"
PARTICIPANTS=$(curl -s "$PARTICIPATION_URL/api/events/$EVENT_ID/participants" -H "Authorization: Bearer $ORG_TOKEN" | json_field totalElements)
check "Participants confirmés côté Participation Service" "$PARTICIPANTS" "$CAPACITY"

WINNER=""
for i in $(seq 1 "$CONCURRENT_USERS"); do
  if [ "$(cat "$TMP/code_$i")" == "201" ]; then WINNER=$(cat "$TMP/token_$i"); break; fi
done

echo "== Double inscription, permissions, désinscription, réinscription"
check "Double inscription -> 409" \
  "$(http_code -X POST "$PARTICIPATION_URL/api/events/$EVENT_ID/join" -H "Authorization: Bearer $WINNER")" 409
check "Un participant ne voit pas la liste des participants -> 403" \
  "$(http_code "$PARTICIPATION_URL/api/events/$EVENT_ID/participants" -H "Authorization: Bearer $WINNER")" 403
check "Un autre parent ne peut pas modifier l'événement -> 403" \
  "$(http_code -X DELETE "$EVENT_URL/api/events/$EVENT_ID" -H "Authorization: Bearer $WINNER")" 403
check "Désinscription -> 204" \
  "$(http_code -X DELETE "$PARTICIPATION_URL/api/events/$EVENT_ID/leave" -H "Authorization: Bearer $WINNER")" 204
check "Seconde désinscription -> 404 (pas de double libération)" \
  "$(http_code -X DELETE "$PARTICIPATION_URL/api/events/$EVENT_ID/leave" -H "Authorization: Bearer $WINNER")" 404
RESERVED=$(curl -s "$EVENT_URL/api/events/$EVENT_ID" -H "Authorization: Bearer $ORG_TOKEN" | json_field reservedPlaces)
check "Place libérée" "$RESERVED" "$((CAPACITY - 1))"
check "Réinscription -> 201" \
  "$(http_code -X POST "$PARTICIPATION_URL/api/events/$EVENT_ID/join" -H "Authorization: Bearer $WINNER")" 201
check "Mes participations" \
  "$(curl -s "$PARTICIPATION_URL/api/events/me/joined" -H "Authorization: Bearer $WINNER" | json_field totalElements)" 1

echo "== Annulation de l'événement"
check "Annulation par l'organisateur -> 204" \
  "$(http_code -X DELETE "$EVENT_URL/api/events/$EVENT_ID" -H "Authorization: Bearer $ORG_TOKEN")" 204
check "Inscription à un événement annulé -> 409" \
  "$(http_code -X POST "$PARTICIPATION_URL/api/events/$EVENT_ID/join" -H "Authorization: Bearer $(token PARENT "$(uuid)")")" 409

rm -rf "$TMP"
echo
echo "Résultat : $PASS réussite(s), $FAIL échec(s)"
[ "$FAIL" -eq 0 ]
