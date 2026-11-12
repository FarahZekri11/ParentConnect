#!/usr/bin/env bash
# =====================================================================
# ParentConnect — tests d'intégration par étapes (après "docker compose up -d --build")
# Usage (racine du projet) : ./scripts/smoke-test.sh
# Prérequis : bash, curl. Lit KC_DEMO_PASSWORD, KC_APP_ADMIN_PASSWORD, RABBITMQ_USER, RABBITMQ_PASSWORD, KEYCLOAK_ADMIN(_PASSWORD) dans .env
# =====================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

envval() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
GW="${GATEWAY_URL:-http://localhost:8080}"
KC="${KEYCLOAK_URL:-http://localhost:8180}"
EUREKA="${EUREKA_URL:-http://localhost:8761}"
RMQ="${RABBITMQ_API:-http://localhost:15672/api}"
PWD_DEMO="$(envval KC_DEMO_PASSWORD)"
# Le compte administrateur a son propre mot de passe (généré par scripts/setup), distinct des comptes de démo
PWD_ADMIN="$(envval KC_APP_ADMIN_PASSWORD)"; PWD_ADMIN="${PWD_ADMIN:-$PWD_DEMO}"
RMQ_AUTH="$(envval RABBITMQ_USER):$(envval RABBITMQ_PASSWORD)"

PASS=0; FAIL=0; FAILED=()
ok() { echo "  [OK]   $1"; PASS=$((PASS+1)); }
ko() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); FAILED+=("$1"); }
expect() { # expect "<description>" <attendu> <obtenu>
  if [ "$3" = "$2" ]; then ok "$1 -> $3"; else ko "$1 : attendu $2, obtenu $3"; fi; }
code() { curl -s -o /tmp/pc_body -w '%{http_code}' --max-time 30 "$@"; }
field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" /tmp/pc_body | head -1; }
token() {
  curl -s --max-time 30 -X POST "$KC/realms/parentconnect/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=frontend-parentconnect \
    --data-urlencode "username=$1" --data-urlencode "password=${2:-$PWD_DEMO}" \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}

echo "== Étape 1 — Infrastructure"
expect "Eureka /actuator/health" 200 "$(code "$EUREKA/actuator/health")"
expect "Keycloak realm parentconnect" 200 "$(code "$KC/realms/parentconnect")"
expect "RabbitMQ API de management" 200 "$(code -u "$RMQ_AUTH" "$RMQ/overview")"
expect "API Gateway /actuator/health" 200 "$(code "$GW/actuator/health")"
expect "Frontend (nginx)" 200 "$(code "http://localhost:4200/")"

echo "== Étape 2 — Microservices (santé directe) et bases de données"
expect "event-service /api/health" 200 "$(code http://localhost:8085/api/health)"
expect "participation-service /api/health" 200 "$(code http://localhost:8086/api/health)"
for p in 8001:post 8002:comment 8003:category 8004:report; do
  expect "${p#*:}-service /api/health" 200 "$(code "http://localhost:${p%%:*}/api/health")"
done
expect "babysitting-service /health" 200 "$(code http://localhost:8005/health)"
expect "marketplace-service /api/health" 200 "$(code http://localhost:3002/api/health)"
expect "messaging-service /health" 200 "$(code http://localhost:8007/health)"
expect "geo-service /health" 200 "$(code http://localhost:8008/health)"

echo "== Étape 3 — Enregistrement Eureka"
APPS="$(curl -s -H 'Accept: application/json' "$EUREKA/eureka/apps")"
for app in PARENTCONNECT-EVENT-SERVICE PARENTCONNECT-PARTICIPATION-SERVICE PARENTCONNECT-POST PARENTCONNECT-COMMENT \
           PARENTCONNECT-CATEGORY PARENTCONNECT-REPORT PARENTCONNECT-BABYSITTING MARKETPLACE-SERVICE MESSAGING-SERVICE PARENTCONNECT-GEO-SERVICE PARENTCONNECT-CONFIG-SERVER API-GATEWAY; do
  if echo "$APPS" | grep -q "\"name\":\"$app\""; then ok "Eureka : $app"; else ko "Eureka : $app absent"; fi
done

echo "== Étape 4 — Sécurité (Keycloak + Gateway)"
ADMIN="$(token admin "$PWD_ADMIN")"; PARENT="$(token parent_test)"; PRO="$(token pro_test)"; SITTER="$(token babysitter_test)"
[ -n "$ADMIN" ] && [ -n "$PARENT" ] && [ -n "$PRO" ] && [ -n "$SITTER" ] && ok "Tokens Keycloak (admin, parent_test, pro_test, babysitter_test)" || ko "Obtention des tokens Keycloak"
if [ "$PWD_ADMIN" != "$PWD_DEMO" ]; then
  [ -z "$(token admin "$PWD_DEMO")" ] && ok "Admin : le mot de passe de démo est refusé" || ko "Admin accessible avec le mot de passe de démo"
fi
expect "Sans token -> /api/events" 401 "$(code "$GW/api/events")"
# Inscription d'un nouveau parent : la Gateway crée le compte Keycloak avec le rôle PARENT
REG_EMAIL="nouveau.parent.$(date +%s)@test.local"; REG_PWD="Inscription2026!"
REG_BODY="{\"firstName\":\"Léa\",\"lastName\":\"Testeur\",\"email\":\"$REG_EMAIL\",\"password\":\"$REG_PWD\"}"
expect "Inscription d'un nouveau parent (Gateway -> Keycloak)" 201 "$(code -H 'Content-Type: application/json' -X POST "$GW/api/auth/register" -d "$REG_BODY")"
REG_USER_ID="$(field id)"
expect "Inscription : e-mail déjà utilisé" 409 "$(code -H 'Content-Type: application/json' -X POST "$GW/api/auth/register" -d "$REG_BODY")"
expect "Inscription : mot de passe trop court" 400 "$(code -H 'Content-Type: application/json' -X POST "$GW/api/auth/register" -d '{"firstName":"A","lastName":"B","email":"court@test.local","password":"court"}')"
NEW_TOKEN="$(curl -s --max-time 30 -X POST "$KC/realms/parentconnect/protocol/openid-connect/token" -d grant_type=password -d client_id=frontend-parentconnect --data-urlencode "username=$REG_EMAIL" --data-urlencode "password=$REG_PWD" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
[ -n "$NEW_TOKEN" ] && ok "Connexion du nouveau parent (Keycloak)" || ko "Connexion du nouveau parent (Keycloak)"
expect "Nouveau parent : rôle PARENT (mes inscriptions)" 200 "$(code -H "Authorization: Bearer $NEW_TOKEN" "$GW/api/events/me/joined")"
expect "Profil du compte (GET /api/auth/me)" 200 "$(code -H "Authorization: Bearer $NEW_TOKEN" "$GW/api/auth/me")"
grep -q '"PARENT"' /tmp/pc_body && ok "Profil : rôle PARENT" || ko "Profil : rôle PARENT absent"
expect "Modification du profil (PUT /api/auth/me)" 200 "$(code -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' -X PUT "$GW/api/auth/me" -d '{"firstName":"Léa-Marie","lastName":"Testeur"}')"
expect "Changement de mot de passe : ancien mot de passe faux" 400 "$(code -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' -X PUT "$GW/api/auth/me/password" -d '{"currentPassword":"Mauvais2026!","newPassword":"Nouveau2026!x"}')"
expect "Changement de mot de passe" 200 "$(code -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' -X PUT "$GW/api/auth/me/password" -d "{\"currentPassword\":\"$REG_PWD\",\"newPassword\":\"Nouveau2026!x\"}")"
[ -n "$(token "$REG_EMAIL" 'Nouveau2026!x')" ] && ok "Connexion avec le nouveau mot de passe" || ko "Connexion avec le nouveau mot de passe"
# Inscription d'un babysitter ; le rôle ADMIN ne peut pas être choisi à l'inscription
SIT_EMAIL="nouveau.babysitter.$(date +%s)@test.local"
expect "Inscription d'un babysitter" 201 "$(code -H 'Content-Type: application/json' -X POST "$GW/api/auth/register" -d "{\"firstName\":\"Sam\",\"lastName\":\"Garde\",\"email\":\"$SIT_EMAIL\",\"password\":\"$REG_PWD\",\"role\":\"BABYSITTER\"}")"
SIT_USER_ID="$(field id)"
grep -q '"role":"BABYSITTER"' /tmp/pc_body && ok "Inscription : rôle BABYSITTER attribué" || ko "Inscription : rôle BABYSITTER non attribué"
expect "Inscription avec le rôle ADMIN refusée" 400 "$(code -H 'Content-Type: application/json' -X POST "$GW/api/auth/register" -d '{"firstName":"Pirate","lastName":"Admin","email":"pirate.admin@test.local","password":"Inscription2026!","role":"ADMIN"}')"
SIG="${PARENT##*.}"; FORGED="${PARENT%.*}.AAAAAAAAAA${SIG:10}"
expect "Token à signature falsifiée" 401 "$(code -H "Authorization: Bearer $FORGED" "$GW/api/events")"
expect "En-têtes d'identité usurpés sans token" 401 "$(code -H 'X-Gateway-Auth: verified' -H 'X-User-Id: aaaaaaaa-0000-4000-8000-000000000001' -H 'X-User-Role: ADMIN' "$GW/api/events")"
expect "Endpoint interne via la Gateway" 404 "$(code "$GW/internal/events/00000000-0000-0000-0000-000000000000")"
expect "Endpoint interne Géolocalisation via la Gateway" 404 "$(code "$GW/internal/geo/distance?user_a=a&user_b=b")"
expect "Accès direct à un service sans token" 401 "$(code http://localhost:8085/api/events)"
expect "/api/admin/** refusé à PARENT dès la Gateway" 403 "$(code -H "Authorization: Bearer $PARENT" "$GW/api/admin/reports")"

echo "== Étape 5 — Routes Gateway et scénarios métier"
AUTH_P=(-H "Authorization: Bearer $PARENT"); AUTH_PRO=(-H "Authorization: Bearer $PRO"); AUTH_A=(-H "Authorization: Bearer $ADMIN")
AUTH_S=(-H "Authorization: Bearer $SITTER")
JSON=(-H 'Content-Type: application/json')
START="$(date -d '+5 days' '+%Y-%m-%dT14:00:00' 2>/dev/null || date -v+5d '+%Y-%m-%dT14:00:00')"
END="$(date -d '+5 days' '+%Y-%m-%dT16:00:00' 2>/dev/null || date -v+5d '+%Y-%m-%dT16:00:00')"
# Événements / Participations
expect "PARENT liste les événements" 200 "$(code "${AUTH_P[@]}" "$GW/api/events")"
EVENT_STAMP="$(date +%s)"
EVENT_BODY="{\"title\":\"Atelier intégration $EVENT_STAMP\",\"category\":\"ATELIER\",\"startDateTime\":\"$START\",\"endDateTime\":\"$END\",\"city\":\"Lyon\",\"capacity\":5}"
expect "PARENT ne crée pas d'événement (réservé à l'ADMIN)" 403 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/events" -d "$EVENT_BODY")"
expect "ADMIN crée un événement" 201 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X POST "$GW/api/events" -d "$EVENT_BODY")"
EVENT_ID="$(field id)"
expect "Recherche texte (titre de l'événement)" 200 "$(code "${AUTH_P[@]}" "$GW/api/events?q=int%C3%A9gration%20$EVENT_STAMP")"
grep -q "$EVENT_ID" /tmp/pc_body && ok "Recherche texte : événement trouvé" || ko "Recherche texte : événement absent"
expect "PARENT s'inscrit avec 2 enfants et un message (route Participation)" 201 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/events/$EVENT_ID/join" -d '{"childrenCount":2,"note":"Allergie aux arachides"}')"
expect "PROFESSIONAL ne peut pas s'inscrire" 403 "$(code "${AUTH_PRO[@]}" -X POST "$GW/api/events/$EVENT_ID/join")"
expect "ADMIN ne peut pas s'inscrire" 403 "$(code "${AUTH_A[@]}" -X POST "$GW/api/events/$EVENT_ID/join")"
expect "Organisateur (ADMIN) voit les participants" 200 "$(code "${AUTH_A[@]}" "$GW/api/events/$EVENT_ID/participants")"
grep -q '"participantName":"Marie Lambert"' /tmp/pc_body && grep -q '"childrenCount":2' /tmp/pc_body \
  && ok "Participants : nom (via la Gateway) et nombre d'enfants enregistrés" || ko "Participants : nom ou nombre d'enfants absent"
expect "Autre utilisateur : participants refusés" 403 "$(code "${AUTH_P[@]}" "$GW/api/events/$EVENT_ID/participants")"
# Communauté
expect "Catégories publiques" 200 "$(code "$GW/api/categories")"
expect "PARENT ne crée pas de catégorie" 403 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/categories" -d '{"name":"Test parent","slug":"test-parent","description":"x"}')"
SLUG="integration-$(date +%s)"
expect "ADMIN crée une catégorie" 201 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X POST "$GW/api/categories" -d "{\"name\":\"Intégration $SLUG\",\"slug\":\"$SLUG\",\"description\":\"Catégorie de test\"}")"
CAT_ID="$(field id)"
expect "PARENT publie un post" 201 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/posts" -d "{\"category_id\":${CAT_ID:-1},\"type\":\"question\",\"title\":\"Sommeil de bébé\",\"content\":\"Quels rituels du coucher conseillez-vous ?\"}")"
POST_ID="$(field id)"
expect "Post consultable sans token" 200 "$(code "$GW/api/posts/$POST_ID")"
expect "PROFESSIONAL commente (route Comment)" 201 "$(code "${AUTH_PRO[@]}" "${JSON[@]}" -X POST "$GW/api/posts/$POST_ID/comments" -d '{"content":"Un bain tiède et une histoire aident beaucoup."}')"
expect "Commentaires publics du post" 200 "$(code "$GW/api/posts/$POST_ID/comments")"
expect "PARENT signale le post (route Report)" 201 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/posts/$POST_ID/report" -d '{"reason":"Test de signalement","details":"Signalement de test d intégration"}')"
REPORT_ID="$(field id)"
expect "ADMIN consulte les signalements" 200 "$(code "${AUTH_A[@]}" "$GW/api/admin/reports")"
# Babysitting, Marketplace, Messagerie
expect "Babysitting sans token" 401 "$(code "$GW/api/babysitting/requests")"
expect "PARENT liste les demandes de babysitting" 200 "$(code "${AUTH_P[@]}" "$GW/api/babysitting/requests")"
BS_DATE="$(date -d '+20 days' +%F 2>/dev/null || date -v+20d +%F)"; BS_HOOD="Quartier-test-$(date +%s)"
BS_REQ="{\"date\":\"$BS_DATE\",\"start_time\":\"18:00:00\",\"end_time\":\"20:00:00\",\"neighborhood\":\"$BS_HOOD\",\"num_children\":1,\"child_age_ranges\":[\"3-6\"]}"
expect "BABYSITTER ne publie pas de demande de garde" 403 "$(code "${AUTH_S[@]}" "${JSON[@]}" -X POST "$GW/api/babysitting/requests" -d "$BS_REQ")"
expect "PARENT publie une demande de garde" 201 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/babysitting/requests" -d "$BS_REQ")"
BS_ID="$(field id)"
grep -q '"requester_name":"[^"]' /tmp/pc_body && ok "Demande de garde : nom du parent enregistré" || ko "Demande de garde : nom du parent absent"
expect "PARENT modifie sa demande" 200 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X PUT "$GW/api/babysitting/requests/$BS_ID" -d '{"num_children":2,"child_age_ranges":["3-6","6-10"],"notes":"Modifiée par le test"}')"
expect "Modification persistée" 200 "$(code "${AUTH_P[@]}" "$GW/api/babysitting/requests/$BS_ID")"
grep -q 'Modifiée par le test' /tmp/pc_body && ok "Demande relue avec la modification" || ko "Modification non persistée"
expect "Un autre parent ne modifie pas la demande" 403 "$(code "${AUTH_PRO[@]}" "${JSON[@]}" -X PUT "$GW/api/babysitting/requests/$BS_ID" -d '{"notes":"x"}')"
expect "PARENT ne publie pas de disponibilité" 403 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/babysitting/availability" -d "{\"is_recurring\":false,\"date\":\"$BS_DATE\",\"start_time\":\"17:00:00\",\"end_time\":\"21:00:00\",\"neighborhood\":\"$BS_HOOD\"}")"
expect "BABYSITTER publie une disponibilité" 201 "$(code "${AUTH_S[@]}" "${JSON[@]}" -X POST "$GW/api/babysitting/availability" -d "{\"is_recurring\":false,\"date\":\"$BS_DATE\",\"start_time\":\"17:00:00\",\"end_time\":\"21:00:00\",\"neighborhood\":\"$BS_HOOD\"}")"
AV_ID="$(field id)"
expect "PARENT recherche un babysitter (quartier + date)" 200 "$(code "${AUTH_P[@]}" "$GW/api/babysitting/availability/search?neighborhood=$BS_HOOD&date=$BS_DATE")"
grep -q "$AV_ID" /tmp/pc_body && ok "Recherche : le babysitter disponible est trouvé" || ko "Recherche : babysitter non trouvé"
expect "Statistiques Babysitting refusées au PARENT" 403 "$(code "${AUTH_P[@]}" "$GW/api/babysitting/admin/stats")"
expect "Statistiques Babysitting (ADMIN)" 200 "$(code "${AUTH_A[@]}" "$GW/api/babysitting/admin/stats")"
expect "BABYSITTER retire sa disponibilité" 204 "$(code "${AUTH_S[@]}" -X DELETE "$GW/api/babysitting/availability/$AV_ID")"
expect "PARENT supprime sa demande" 204 "$(code "${AUTH_P[@]}" -X DELETE "$GW/api/babysitting/requests/$BS_ID")"
expect "Demande supprimée introuvable" 404 "$(code "${AUTH_P[@]}" "$GW/api/babysitting/requests/$BS_ID")"
expect "Marketplace : annonces publiques" 200 "$(code "$GW/api/listings")"
# Photos téléversées depuis l'ordinateur (PNG 1x1 réel) et faux fichier image refusé
PNG_FILE="$(mktemp --suffix=.png)"; FAKE_FILE="$(mktemp --suffix=.jpg)"
LNG_MP="-140.12"; LAT_MP="-45.34"   # zone isolée : l'annonce de test n'apparaît pas près des données de démonstration
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC' | base64 -d > "$PNG_FILE"
printf 'MZ ceci est un executable deguise en image' > "$FAKE_FILE"
expect "Marketplace : photo téléversée (multipart)" 201 "$(code "${AUTH_P[@]}" -F "files=@$PNG_FILE;type=image/png" "$GW/api/listings/uploads")"
MP_IMG="$(sed -n 's/.*"urls":\["\([^"]*\)".*/\1/p' /tmp/pc_body)"
expect "Marketplace : faux fichier image refusé" 400 "$(code "${AUTH_P[@]}" -F "files=@$FAKE_FILE;type=image/jpeg" "$GW/api/listings/uploads")"
expect "Marketplace : photo servie" 200 "$(code "$GW$MP_IMG")"
expect "Marketplace : traversée de chemin bloquée" 404 "$(code "$GW/api/listings/uploads/..%2F..%2Fetc%2Fpasswd")"
LISTING="{\"title\":\"Poussette test\",\"description\":\"Annonce créée par le test automatique\",\"category\":\"PUERICULTURE\",\"condition\":\"GOOD\",\"type\":\"SALE\",\"price\":120,\"currency\":\"TND\",\"images\":[\"$MP_IMG\"],\"location\":{\"city\":\"Test\",\"coordinates\":[$LNG_MP,$LAT_MP]}}"
expect "Marketplace : devise inconnue refusée" 400 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/listings" -d "${LISTING/TND/GBP}")"
expect "Marketplace : annonce en TND avec photo" 201 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/listings" -d "$LISTING")"
LISTING_ID="$(field _id)"
grep -q '"currency":"TND"' /tmp/pc_body && grep -q '"ownerName":"[^"]' /tmp/pc_body && ok "Marketplace : devise et nom du vendeur enregistrés" || ko "Marketplace : devise ou nom du vendeur absent"
expect "Marketplace : modification par le propriétaire" 200 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X PUT "$GW/api/listings/$LISTING_ID" -d '{"price":95,"currency":"EUR"}')"
grep -q '"price":95' /tmp/pc_body && grep -q '"currency":"EUR"' /tmp/pc_body && ok "Marketplace : modification persistée" || ko "Marketplace : modification non persistée"
expect "Marketplace : modification refusée à un autre parent" 403 "$(code "${AUTH_PRO[@]}" "${JSON[@]}" -X PUT "$GW/api/listings/$LISTING_ID" -d '{"price":1}')"
code "$GW/api/listings?lat=$LAT_MP&lng=$LNG_MP&radiusKm=5" > /dev/null
grep -q "$LISTING_ID" /tmp/pc_body && ok "Marketplace : annonce trouvée à proximité (5 km)" || ko "Marketplace : recherche à proximité"
expect "Marketplace : statistiques ADMIN" 200 "$(code "${AUTH_A[@]}" "$GW/api/listings/admin/stats")"
expect "Marketplace : statistiques refusées au PARENT" 403 "$(code "${AUTH_P[@]}" "$GW/api/listings/admin/stats")"
# Communauté : photos de publication et modification des commentaires
expect "Communauté : photo téléversée" 201 "$(code "${AUTH_P[@]}" -H 'Accept: application/json' -F "files[]=@$PNG_FILE;type=image/png" "$GW/api/posts/images")"
POST_IMG="$(sed -n 's/.*"urls":\["\([^"]*\)".*/\1/p' /tmp/pc_body | sed 's#\\/#/#g')"
expect "Communauté : faux fichier image refusé" 422 "$(code "${AUTH_P[@]}" -H 'Accept: application/json' -F "files[]=@$FAKE_FILE;type=image/jpeg" "$GW/api/posts/images")"
expect "Communauté : publication avec photo" 201 "$(code "${AUTH_P[@]}" "${JSON[@]}" -H 'Accept: application/json' -X POST "$GW/api/posts" -d "{\"category_id\":${CAT_ID:-1},\"type\":\"post\",\"title\":\"Photo de test\",\"content\":\"Publication avec une photo de test\",\"images\":[\"$POST_IMG\"]}")"
IMG_POST_ID="$(field id)"
expect "Communauté : modification de la publication" 200 "$(code "${AUTH_P[@]}" "${JSON[@]}" -H 'Accept: application/json' -X PUT "$GW/api/posts/$IMG_POST_ID" -d "{\"category_id\":${CAT_ID:-1},\"type\":\"post\",\"title\":\"Photo de test modifiée\",\"images\":[]}")"
expect "Communauté : commentaire" 201 "$(code "${AUTH_PRO[@]}" "${JSON[@]}" -H 'Accept: application/json' -X POST "$GW/api/posts/$IMG_POST_ID/comments" -d '{"content":"Commentaire à modifier"}')"
COMMENT_ID="$(field id)"
expect "Communauté : modification du commentaire par son auteur" 200 "$(code "${AUTH_PRO[@]}" "${JSON[@]}" -H 'Accept: application/json' -X PUT "$GW/api/comments/$COMMENT_ID" -d '{"content":"Commentaire modifié"}')"
expect "Communauté : modification refusée à un autre parent" 403 "$(code "${AUTH_P[@]}" "${JSON[@]}" -H 'Accept: application/json' -X PUT "$GW/api/comments/$COMMENT_ID" -d '{"content":"Tentative interdite"}')"
# Messagerie : image jointe (participants uniquement), modification et suppression de son message
SITTER_B64="$(echo "$SITTER" | cut -d. -f2 | tr '_-' '/+')"; while [ $(( ${#SITTER_B64} % 4 )) -ne 0 ]; do SITTER_B64="$SITTER_B64="; done
SITTER_ID="$(echo "$SITTER_B64" | base64 -d 2>/dev/null | sed -n 's/.*"sub":"\([^"]*\)".*/\1/p')"
code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/conversations" -d "{\"type\":\"DIRECT\",\"participants\":[\"$SITTER_ID\"]}" > /dev/null
CONV_ID="$(sed -n 's/.*"data":{"id":"\([^"]*\)".*/\1/p' /tmp/pc_body)"
expect "Messagerie : image jointe téléversée" 201 "$(code "${AUTH_P[@]}" -F "conversation_id=$CONV_ID" -F "file=@$PNG_FILE;type=image/png" "$GW/api/messages/attachments")"
ATT_ID="$(sed -n 's/.*"data":{"id":"\([^"]*\)".*/\1/p' /tmp/pc_body)"
expect "Messagerie : faux fichier image refusé" 400 "$(code "${AUTH_P[@]}" -F "conversation_id=$CONV_ID" -F "file=@$FAKE_FILE;type=image/jpeg" "$GW/api/messages/attachments")"
expect "Messagerie : message avec image" 201 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/messages" -d "{\"conversation_id\":\"$CONV_ID\",\"content\":\"Voici la photo\",\"attachments\":[\"$ATT_ID\"]}")"
MSG_ID="$(sed -n 's/.*"data":{"id":"\([^"]*\)".*/\1/p' /tmp/pc_body)"
expect "Messagerie : le destinataire voit l'image" 200 "$(code "${AUTH_S[@]}" "$GW/api/messages/attachments/$ATT_ID")"
expect "Messagerie : image refusée hors conversation" 403 "$(code "${AUTH_PRO[@]}" "$GW/api/messages/attachments/$ATT_ID")"
expect "Messagerie : modification par l'expéditeur" 200 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X PATCH "$GW/api/messages/$MSG_ID" -d '{"content":"Voici la photo (modifié)"}')"
expect "Messagerie : modification refusée au destinataire" 403 "$(code "${AUTH_S[@]}" "${JSON[@]}" -X PATCH "$GW/api/messages/$MSG_ID" -d '{"content":"pirate"}')"
expect "Messagerie : suppression par l'expéditeur" 204 "$(code "${AUTH_P[@]}" -X DELETE "$GW/api/messages/$MSG_ID")"
expect "Messagerie : image effacée avec le message" 404 "$(code "${AUTH_S[@]}" "$GW/api/messages/attachments/$ATT_ID")"
expect "Messagerie : statistiques ADMIN (sans contenu)" 200 "$(code "${AUTH_A[@]}" "$GW/api/messages/admin/stats")"
# Géolocalisation : quartier créé par l'ADMIN (zone unique à chaque exécution), deux parents s'y rattachent
expect "Géolocalisation sans token" 401 "$(code "$GW/api/geo/neighborhoods")"
expect "PARENT liste les quartiers (route Géolocalisation)" 200 "$(code "${AUTH_P[@]}" "$GW/api/geo/neighborhoods")"
LNG="$(awk -v r=$RANDOM 'BEGIN{printf "%.2f", -150 + (r % 3000) / 10}')"; LAT="$(awk -v r=$RANDOM 'BEGIN{printf "%.2f", -50 + (r % 1000) / 10}')"
POLY="$(awk -v x="$LNG" -v y="$LAT" 'BEGIN{printf "[[[%.2f,%.2f],[%.2f,%.2f],[%.2f,%.2f],[%.2f,%.2f],[%.2f,%.2f]]]", x-0.05,y-0.05, x+0.05,y-0.05, x+0.05,y+0.05, x-0.05,y+0.05, x-0.05,y-0.05}')"
NH_BODY="{\"name\":\"Quartier test $LNG\",\"city\":\"Démo\",\"boundary\":{\"type\":\"Polygon\",\"coordinates\":$POLY},\"center\":{\"type\":\"Point\",\"coordinates\":[$LNG,$LAT]}}"
expect "PARENT ne crée pas de quartier" 403 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X POST "$GW/api/geo/neighborhoods" -d "$NH_BODY")"
expect "ADMIN crée un quartier" 201 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X POST "$GW/api/geo/neighborhoods" -d "$NH_BODY")"
NH_ID="$(field id)"
expect "ADMIN ajoute un point de rencontre" 201 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X POST "$GW/api/geo/meeting-points" -d "{\"neighborhood_id\":\"$NH_ID\",\"name\":\"Parc de test\",\"type\":\"park\",\"location\":{\"type\":\"Point\",\"coordinates\":[$LNG,$LAT]}}")"
MP_ID="$(field id)"
expect "ADMIN modifie le point de rencontre" 200 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PUT "$GW/api/geo/meeting-points/$MP_ID" -d '{"name":"Parc de test renommé"}')"
expect "PARENT ne modifie pas un point de rencontre" 403 "$(code "${AUTH_P[@]}" "${JSON[@]}" -X PUT "$GW/api/geo/meeting-points/$MP_ID" -d '{"name":"x"}')"
expect "Recherche de parents à 20 km" 200 "$(code "${AUTH_A[@]}" "$GW/api/geo/nearby?lng=$LNG&lat=$LAT&radius=20000")"
expect "Événements à proximité (lat/lng/rayon)" 200 "$(code "${AUTH_P[@]}" "$GW/api/events?lat=$LAT&lng=$LNG&radiusKm=20")"
expect "Statistiques Géolocalisation (ADMIN)" 200 "$(code "${AUTH_A[@]}" "$GW/api/geo/admin/stats")"
# Comptes admin et pro_test : les positions des parents de démonstration (Marie, Paul) ne sont pas modifiées
expect "admin enregistre sa position (floutée)" 200 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X POST "$GW/api/geo/locations" -d "{\"lng\":$LNG,\"lat\":$LAT}")"
expect "pro_test enregistre sa position dans le même quartier" 200 "$(code "${AUTH_PRO[@]}" "${JSON[@]}" -X POST "$GW/api/geo/locations" -d "{\"lng\":$LNG,\"lat\":$LAT}")"
grep -q '"precision_m":200' /tmp/pc_body && ok "Position stockée floutée (précision 200 m)" || ko "Précision de floutage absente de la réponse"
expect "Messagerie sans token" 401 "$(code "$GW/api/notifications/unread-count")"
expect "PARENT : notifications non lues" 200 "$(code "${AUTH_P[@]}" "$GW/api/notifications/unread-count")"
# Administration (Gateway) : statistiques réelles agrégées et gestion des comptes Keycloak
expect "Statistiques administrateur (Gateway)" 200 "$(code "${AUTH_A[@]}" "$GW/api/admin/stats")"
grep -q '"available":false' /tmp/pc_body && ko "Statistiques : un module n'a pas répondu" || ok "Statistiques : tous les modules ont répondu"
grep -q '"registrationsByDay"' /tmp/pc_body && ok "Statistiques : inscriptions par jour" || ko "Statistiques : inscriptions par jour absentes"
expect "Statistiques administrateur refusées au PARENT" 403 "$(code "${AUTH_P[@]}" "$GW/api/admin/stats")"
expect "Administration : recherche d'un utilisateur" 200 "$(code "${AUTH_A[@]}" "$GW/api/admin/users?search=nouveau.babysitter")"
grep -q "$SIT_USER_ID" /tmp/pc_body && ok "Administration : babysitter de test trouvé" || ko "Administration : babysitter de test introuvable"
expect "Administration : filtre par rôle BABYSITTER" 200 "$(code "${AUTH_A[@]}" "$GW/api/admin/users?role=BABYSITTER")"
expect "Administration : modification d'un compte" 200 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PUT "$GW/api/admin/users/$SIT_USER_ID" -d "{\"firstName\":\"Samia\",\"lastName\":\"Garde\",\"email\":\"$SIT_EMAIL\"}")"
expect "Administration : changement de rôle (PARENT)" 200 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PUT "$GW/api/admin/users/$SIT_USER_ID/role" -d '{"role":"PARENT"}')"
expect "Administration : rôle invalide refusé" 400 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PUT "$GW/api/admin/users/$SIT_USER_ID/role" -d '{"role":"SUPERADMIN"}')"
expect "Administration : suspension du compte" 200 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PUT "$GW/api/admin/users/$SIT_USER_ID/enabled" -d '{"enabled":false}')"
[ -z "$(token "$SIT_EMAIL" "$REG_PWD")" ] && ok "Compte suspendu : connexion refusée" || ko "Compte suspendu : connexion encore possible"
expect "Administration : réactivation du compte" 200 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PUT "$GW/api/admin/users/$SIT_USER_ID/enabled" -d '{"enabled":true}')"
ADMIN_B64="$(echo "$ADMIN" | cut -d. -f2 | tr '_-' '/+')"; while [ $(( ${#ADMIN_B64} % 4 )) -ne 0 ]; do ADMIN_B64="$ADMIN_B64="; done
ADMIN_ID="$(echo "$ADMIN_B64" | base64 -d 2>/dev/null | sed -n 's/.*"sub":"\([^"]*\)".*/\1/p')"
expect "Administration : impossible de se suspendre soi-même" 409 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PUT "$GW/api/admin/users/$ADMIN_ID/enabled" -d '{"enabled":false}')"
expect "Administration : impossible de retirer son propre rôle ADMIN" 409 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PUT "$GW/api/admin/users/$ADMIN_ID/role" -d '{"role":"PARENT"}')"
# Microservices : Config Server, Swagger centralisé
CONFIG="${CONFIG_URL:-http://localhost:8888}"
expect "Config Server : configuration de Participation" 200 "$(code "$CONFIG/parentconnect-participation-service/default")"
grep -q 'config-repo/parentconnect-participation-service.yml' /tmp/pc_body && ok "Config Server : fichier du dépôt config-repo servi" || ko "Config Server : fichier du dépôt absent"
code "http://localhost:8086/actuator/info" > /dev/null
grep -q 'config-server' /tmp/pc_body && ok "Participation a chargé sa configuration depuis le Config Server" || ko "Participation n'a pas chargé le Config Server"
code "http://localhost:8085/actuator/info" > /dev/null
grep -q 'config-server' /tmp/pc_body && ok "Event a chargé sa configuration depuis le Config Server" || ko "Event n'a pas chargé le Config Server"
SWAGGER_CODE="$(code -L "$GW/swagger-ui.html")"; [ "$SWAGGER_CODE" = "200" ] && ok "Swagger UI centralisé (Gateway)" || ko "Swagger UI centralisé : $SWAGGER_CODE"
expect "OpenAPI de la Gateway" 200 "$(code "$GW/v3/api-docs")"
for d in events participations babysitting marketplace messaging geo posts comments categories reports; do
  expect "OpenAPI via la Gateway : $d" 200 "$(code "$GW/docs/$d")"
done
# CORS (frontend)
CORS="$(curl -s -o /dev/null -D - -X OPTIONS -H 'Origin: http://localhost:4200' -H 'Access-Control-Request-Method: GET' "$GW/api/events" | grep -i '^access-control-allow-origin' | tr -d '\r')"
[ -n "$CORS" ] && ok "CORS pré-vol depuis http://localhost:4200 ($CORS)" || ko "CORS pré-vol depuis http://localhost:4200"

echo "== Étape 6 — RabbitMQ"
for ex in parentconnect.topic parentconnect.events parentconnect.dlx; do
  expect "Exchange $ex" 200 "$(code -u "$RMQ_AUTH" "$RMQ/exchanges/%2F/$ex")"
done
if curl -s -u "$RMQ_AUTH" "$RMQ/exchanges/%2F/parentconnect.events/bindings/source" | grep -q '"destination":"parentconnect.topic"'; then
  ok "Pont de compatibilité parentconnect.events -> parentconnect.topic"; else ko "Pont de compatibilité parentconnect.events -> parentconnect.topic"; fi
sleep 6
IN="$(curl -s -u "$RMQ_AUTH" "$RMQ/exchanges/%2F/parentconnect.topic" | sed -n 's/.*"publish_in":\([0-9]*\).*/\1/p')"
[ "${IN:-0}" -gt 0 ] && ok "Événements publiés sur parentconnect.topic ($IN)" || ko "Aucun événement publié sur parentconnect.topic"
# Queues déclarées par les services (Babysitting déclare la sienne au premier événement publié)
for q in participation_events_queue parentconnect.marketplace.queue geo_events_queue messaging.events messaging.dlq; do
  expect "Queue $q" 200 "$(code -u "$RMQ_AUTH" "$RMQ/queues/%2F/$q")"
done
# Événements -> Messaging : l'organisateur (admin) est notifié de l'inscription de parent_test (étape 5)
sleep 2
code "${AUTH_A[@]}" "$GW/api/notifications" > /dev/null
grep -q "$EVENT_ID" /tmp/pc_body && grep -q 'EVENT_REGISTRATION' /tmp/pc_body \
  && ok "Inscription à un événement -> notification de l'organisateur (Participation -> RabbitMQ -> Messaging)" \
  || ko "L'organisateur n'a pas reçu la notification d'inscription"
# Géolocalisation -> Messaging : l'admin (déjà dans le quartier) est prévenu de l'arrivée d'un nouveau voisin (étape 5)
code "${AUTH_A[@]}" "$GW/api/notifications" > /dev/null
grep -q 'NEW_NEIGHBOR_JOINED' /tmp/pc_body && grep -q "Quartier test $LNG" /tmp/pc_body \
  && ok "Nouveau voisin -> notification du voisin (Géolocalisation -> RabbitMQ -> Messaging)" \
  || ko "Le voisin n'a pas reçu la notification « nouveau voisin »"
# Livraison de bout en bout : enveloppe standard publiée sur l'ancien exchange, relayée par le pont vers parentconnect.topic
EVT="smoke-$(date +%s)"
PAYLOAD="{\\\"event_id\\\":\\\"$EVT\\\",\\\"type\\\":\\\"BookingAccepted\\\",\\\"data\\\":{\\\"booking_id\\\":\\\"$EVT\\\",\\\"requester_id\\\":\\\"aaaaaaaa-0000-4000-8000-000000000003\\\",\\\"babysitter_id\\\":\\\"aaaaaaaa-0000-4000-8000-000000000005\\\"}}"
curl -s -u "$RMQ_AUTH" -X POST -H 'content-type: application/json' "$RMQ/exchanges/%2F/parentconnect.events/publish" \
  -d "{\"properties\":{\"content_type\":\"application/json\"},\"routing_key\":\"babysitting.booking.accepted\",\"payload\":\"$PAYLOAD\",\"payload_encoding\":\"string\"}" > /tmp/pc_body
grep -q '"routed":true' /tmp/pc_body && ok "Événement de l'ancien exchange routé via le pont vers Messaging" || ko "Événement non routé"
sleep 4
code -H "Authorization: Bearer $PARENT" "$GW/api/conversations" > /dev/null
grep -q "$EVT" /tmp/pc_body && ok "Messaging a consommé l'événement (conversation créée, visible via la Gateway)" || ko "Messaging n'a pas consommé l'événement"
# Gestion d'erreur : un message malformé part en dead-letter queue
DLQ_BEFORE="$(curl -s -u "$RMQ_AUTH" "$RMQ/queues/%2F/messaging.dlq" | grep -o '"messages":[0-9]*' | head -1 | cut -d: -f2)"
curl -s -u "$RMQ_AUTH" -X POST -H 'content-type: application/json' "$RMQ/exchanges/%2F/parentconnect.topic/publish" \
  -d '{"properties":{},"routing_key":"babysitting.booking.accepted","payload":"message malformé","payload_encoding":"string"}' > /dev/null
sleep 8   # les statistiques de RabbitMQ sont rafraîchies toutes les 5 s
DLQ_AFTER="$(curl -s -u "$RMQ_AUTH" "$RMQ/queues/%2F/messaging.dlq" | grep -o '"messages":[0-9]*' | head -1 | cut -d: -f2)"
[ "${DLQ_AFTER:-0}" -gt "${DLQ_BEFORE:-0}" ] && ok "Message malformé envoyé en DLQ (messaging.dlq : $DLQ_BEFORE -> $DLQ_AFTER)" || ko "Message malformé non envoyé en DLQ"

echo "== Étape 7 — Nettoyage des données de test (la démo reste propre)"
expect "Signalement de test clôturé (ADMIN)" 200 "$(code "${AUTH_A[@]}" "${JSON[@]}" -X PATCH "$GW/api/admin/reports/$REPORT_ID" -d '{"action":"reject","notes":"Test automatique"}')"
expect "Post de test supprimé (auteur)" 200 "$(code "${AUTH_P[@]}" -X DELETE "$GW/api/posts/$POST_ID")"
expect "Publication avec photo supprimée (auteur)" 200 "$(code "${AUTH_P[@]}" -X DELETE "$GW/api/posts/$IMG_POST_ID")"
expect "Annonce de test supprimée (propriétaire)" 200 "$(code "${AUTH_P[@]}" -X DELETE "$GW/api/listings/$LISTING_ID")"
expect "Quartier de test supprimé (ADMIN, avec ses points de rencontre)" 204 "$(code "${AUTH_A[@]}" -X DELETE "$GW/api/geo/neighborhoods/$NH_ID")"
expect "Point de rencontre supprimé avec le quartier" 404 "$(code "${AUTH_A[@]}" -X DELETE "$GW/api/geo/meeting-points/$MP_ID")"
rm -f -- "$PNG_FILE" "$FAKE_FILE"
expect "Catégorie de test supprimée (ADMIN)" 200 "$(code "${AUTH_A[@]}" -X DELETE "$GW/api/categories/$CAT_ID")"
expect "Événement de test annulé (ADMIN)" 204 "$(code "${AUTH_A[@]}" -X DELETE "$GW/api/events/$EVENT_ID")"
KC_ADMIN_TOKEN="$(curl -s -X POST "$KC/realms/master/protocol/openid-connect/token" -d grant_type=password -d client_id=admin-cli --data-urlencode "username=$(envval KEYCLOAK_ADMIN)" --data-urlencode "password=$(envval KEYCLOAK_ADMIN_PASSWORD)" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
expect "Compte de test supprimé de Keycloak" 204 "$(code -H "Authorization: Bearer $KC_ADMIN_TOKEN" -X DELETE "$KC/admin/realms/parentconnect/users/$REG_USER_ID")"
expect "Babysitter de test supprimé de Keycloak" 204 "$(code -H "Authorization: Bearer $KC_ADMIN_TOKEN" -X DELETE "$KC/admin/realms/parentconnect/users/$SIT_USER_ID")"

echo
echo "Résultat : $PASS réussite(s), $FAIL échec(s)"
for f in "${FAILED[@]}"; do echo "  - $f"; done
[ "$FAIL" -eq 0 ]
