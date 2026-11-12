#!/bin/bash
# =====================================================================
# ParentConnect — configuration du client Keycloak d'inscription (exécutée à chaque démarrage, idempotente)
#
# Crée ou met à jour le client confidentiel « parentconnect-registration » du realm parentconnect :
#   - compte de service (client credentials) utilisé UNIQUEMENT par l'API Gateway (POST /api/auth/register)
#   - droits limités à la gestion des utilisateurs (realm-management : manage-users, view-users,
#     query-users, view-realm)
#   - secret = KC_REGISTRATION_CLIENT_SECRET du .env (jamais versionné)
#   - rôle BABYSITTER (inscription « Babysitter ») et compte de démonstration babysitter_test
#   - mot de passe des comptes administrateurs (admin, farah) = KC_APP_ADMIN_PASSWORD du .env
#     (généré par scripts/setup ; jamais écrit dans le dépôt ni dans le frontend)
# Fonctionne aussi sur un Keycloak déjà initialisé (le fichier du realm n'est importé qu'au premier démarrage).
# =====================================================================
set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
CFG=/tmp/kcadm.config
REALM=parentconnect
CLIENT=parentconnect-registration
SERVER=${KEYCLOAK_URL:-http://keycloak:8180}

echo "[keycloak-init] Connexion à $SERVER..."
for i in $(seq 1 60); do
  if $KCADM config credentials --config "$CFG" --server "$SERVER" --realm master \
       --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then echo "[keycloak-init] ERREUR : Keycloak injoignable" >&2; exit 1; fi
  sleep 3
done

CID=$($KCADM get clients -r "$REALM" -q clientId="$CLIENT" --fields id --format csv --noquotes --config "$CFG" | tr -d '\r')
if [ -z "$CID" ]; then
  $KCADM create clients -r "$REALM" --config "$CFG" \
    -s clientId="$CLIENT" -s name="Inscription ParentConnect (API Gateway)" -s enabled=true \
    -s publicClient=false -s serviceAccountsEnabled=true -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false -s implicitFlowEnabled=false \
    -s secret="$KC_REGISTRATION_CLIENT_SECRET" >/dev/null
  echo "[keycloak-init] client $CLIENT créé"
else
  $KCADM update "clients/$CID" -r "$REALM" --config "$CFG" -s secret="$KC_REGISTRATION_CLIENT_SECRET" -s enabled=true
  echo "[keycloak-init] client $CLIENT mis à jour"
fi

$KCADM add-roles -r "$REALM" --config "$CFG" --uusername "service-account-$CLIENT" --cclientid realm-management \
  --rolename manage-users --rolename view-users --rolename query-users --rolename view-realm
echo "[keycloak-init] droits du compte de service : manage-users, view-users, query-users, view-realm"

# --- Rôle BABYSITTER (choisi à l'inscription, à côté de PARENT)
if ! $KCADM get roles/BABYSITTER -r "$REALM" --config "$CFG" >/dev/null 2>&1; then
  $KCADM create roles -r "$REALM" --config "$CFG" -s name=BABYSITTER \
    -s "description=Babysitter : propose ses disponibilités et accepte des gardes" >/dev/null
  echo "[keycloak-init] rôle BABYSITTER créé"
fi

# --- PARENT ne doit plus être un rôle par défaut du realm : sinon chaque compte (babysitter compris) le reçoit.
# Migration unique et sans perte : tout compte existant qui n'est pas babysitter reçoit d'abord PARENT
# explicitement (il conserve donc exactement ses droits), puis PARENT est retiré des rôles par défaut.
DEFAULT_ROLES="default-roles-$REALM"
if $KCADM get "roles/$DEFAULT_ROLES/composites" -r "$REALM" --fields name --format csv --noquotes --config "$CFG" \
     | tr -d '\r' | grep -qx PARENT; then
  COUNT=0
  while IFS=, read -r UID_ USERNAME_; do
    [ -z "$UID_" ] && continue
    case "$USERNAME_" in service-account-*) continue ;; esac
    DIRECT=$($KCADM get "users/$UID_/role-mappings/realm" -r "$REALM" --fields name --format csv --noquotes --config "$CFG" | tr -d '\r')
    if ! echo "$DIRECT" | grep -qx BABYSITTER; then
      $KCADM add-roles -r "$REALM" --config "$CFG" --uid "$UID_" --rolename PARENT
      COUNT=$((COUNT + 1))
    fi
  done < <($KCADM get users -r "$REALM" --limit 100000 --fields id,username --format csv --noquotes --config "$CFG" | tr -d '\r')
  $KCADM remove-roles -r "$REALM" --config "$CFG" --rname "$DEFAULT_ROLES" --rolename PARENT
  echo "[keycloak-init] PARENT retiré des rôles par défaut ($COUNT compte(s) existant(s) conservent PARENT explicitement)"
fi

# --- Compte de démonstration babysitter (mot de passe = KC_DEMO_PASSWORD)
if [ -n "${KC_DEMO_PASSWORD:-}" ]; then
  BID=$($KCADM get users -r "$REALM" -q username=babysitter_test -q exact=true --fields id --format csv --noquotes --config "$CFG" | tr -d '\r')
  if [ -z "$BID" ]; then
    $KCADM create users -r "$REALM" --config "$CFG" -s username=babysitter_test -s email=nadia.k@email.com \
      -s firstName=Nadia -s lastName=Karoui -s enabled=true -s emailVerified=true >/dev/null
    $KCADM set-password -r "$REALM" --config "$CFG" --username babysitter_test --new-password "$KC_DEMO_PASSWORD"
    echo "[keycloak-init] compte de démonstration babysitter_test (nadia.k@email.com) créé"
  fi
  $KCADM add-roles -r "$REALM" --config "$CFG" --uusername babysitter_test --rolename BABYSITTER --rolename USER
  # Un babysitter n'est pas parent (créé avant la migration ci-dessus, il a pu recevoir PARENT)
  $KCADM remove-roles -r "$REALM" --config "$CFG" --uusername babysitter_test --rolename PARENT 2>/dev/null || true
fi

# --- Mot de passe des administrateurs (jamais codé en dur : variable du .env).
# Initialisé une seule fois par compte (attribut pc_admin_password_initialized) : un mot de passe modifié
# ensuite par l'administrateur depuis son profil n'est pas écrasé au redémarrage suivant.
if [ -n "${KC_APP_ADMIN_PASSWORD:-}" ]; then
  for ADMIN_USER in admin farah; do
    AID=$($KCADM get users -r "$REALM" -q username=$ADMIN_USER -q exact=true --fields id --format csv --noquotes --config "$CFG" | tr -d '\r')
    [ -z "$AID" ] && continue
    if ! $KCADM get "users/$AID" -r "$REALM" --fields attributes --config "$CFG" | grep -q pc_admin_password_initialized; then
      $KCADM set-password -r "$REALM" --config "$CFG" --username "$ADMIN_USER" --new-password "$KC_APP_ADMIN_PASSWORD"
      $KCADM update "users/$AID" -r "$REALM" --config "$CFG" -s 'attributes.pc_admin_password_initialized=["true"]'
      echo "[keycloak-init] mot de passe de $ADMIN_USER initialisé (KC_APP_ADMIN_PASSWORD)"
    fi
  done
fi
echo "[keycloak-init] Terminé."
