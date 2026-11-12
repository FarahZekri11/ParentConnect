#!/bin/sh
# =====================================================================
# ParentConnect — Initialisation centralisée de RabbitMQ (exécutée une fois par docker compose)
#
# Déclare via l'API HTTP de management (idempotent : sans effet si déjà déclaré à l'identique) :
#   - parentconnect.topic  : exchange topic partagé standard (Events, Participation, Babysitting,
#                            Marketplace, Messaging)
#   - parentconnect.events : ancien exchange du contrat Messaging, conservé pour compatibilité
#   - parentconnect.dlx    : dead-letter exchange (direct) utilisé par le service Messaging
#   - pont parentconnect.events -> parentconnect.topic (clé "#") : un service qui publierait encore sur
#     l'ancien exchange (ex. futur service Géolocalisation) reste entendu par tous les consommateurs.
#     L'ancien pont inverse (topic -> events), s'il existe dans un volume RabbitMQ existant, est supprimé.
# Les queues sont déclarées par chaque service (queue dédiée <service>_events_queue, DLQ...).
# =====================================================================
set -eu

API="http://${RABBITMQ_HOST:-rabbitmq}:15672/api"
AUTH="${RABBITMQ_USER}:${RABBITMQ_PASSWORD}"
VHOST="%2F"

echo "[rabbitmq-init] Attente de l'API de management ($API)..."
i=0
until curl -sf -u "$AUTH" "$API/overview" > /dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "[rabbitmq-init] ERREUR : API de management injoignable" >&2
    exit 1
  fi
  sleep 2
done

declare_exchange() {
  curl -sf -u "$AUTH" -X PUT -H "content-type: application/json" \
    "$API/exchanges/$VHOST/$1" \
    -d "{\"type\":\"$2\",\"durable\":true,\"auto_delete\":false,\"internal\":false,\"arguments\":{}}"
  echo "[rabbitmq-init] exchange $1 ($2, durable) OK"
}

declare_exchange "parentconnect.topic" "topic"
declare_exchange "parentconnect.events" "topic"
declare_exchange "parentconnect.dlx" "direct"

# Ancien pont topic -> events (versions précédentes de l'intégration) : supprimé s'il existe (404 ignoré)
curl -s -o /dev/null -u "$AUTH" -X DELETE \
  "$API/bindings/$VHOST/e/parentconnect.topic/e/parentconnect.events/%23" || true

curl -sf -u "$AUTH" -X POST -H "content-type: application/json" \
  "$API/bindings/$VHOST/e/parentconnect.events/e/parentconnect.topic" \
  -d '{"routing_key":"#","arguments":{}}'
echo "[rabbitmq-init] pont parentconnect.events -> parentconnect.topic (#) OK"

echo "[rabbitmq-init] Terminé."
