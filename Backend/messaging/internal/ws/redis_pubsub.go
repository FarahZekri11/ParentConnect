package ws

import (
	"context"
	"encoding/json"
	"log"

	"github.com/parentconnect/messaging-service/internal/database"
)

const RedisWSEventsChannel = "parentconnect:ws:events"

// RedisPubSub gère la synchronisation inter-instances du microservice Messaging via Redis
type RedisPubSub struct {
	redisClient *database.Redis
	hub         *Hub
}

// NewRedisPubSub instancie le gestionnaire Redis Pub/Sub
func NewRedisPubSub(redisClient *database.Redis, hub *Hub) *RedisPubSub {
	return &RedisPubSub{
		redisClient: redisClient,
		hub:         hub,
	}
}

// Publish publie un événement vers toutes les instances du service Messaging
func (r *RedisPubSub) Publish(ctx context.Context, targetUserIDs []string, msg OutboundMessage) error {
	if r.redisClient == nil || r.redisClient.Client == nil {
		return nil // Fonctionnement standalone sans Redis
	}

	payload := InterInstanceMessage{
		TargetUserIDs: targetUserIDs,
		Message:       msg,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return r.redisClient.Client.Publish(ctx, RedisWSEventsChannel, data).Err()
}

// StartSubscription écoute le canal Redis et distribue les messages aux clients locaux du Hub
func (r *RedisPubSub) StartSubscription(ctx context.Context) {
	if r.redisClient == nil || r.redisClient.Client == nil {
		log.Println("[INFO] Redis non configuré : fonctionnement WebSocket en instance unique")
		return
	}

	pubsub := r.redisClient.Client.Subscribe(ctx, RedisWSEventsChannel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	log.Printf("[INFO] Souscription active au canal Redis Pub/Sub : %s", RedisWSEventsChannel)

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}

			var interMsg InterInstanceMessage
			if err := json.Unmarshal([]byte(msg.Payload), &interMsg); err != nil {
				log.Printf("[WARN] Message Redis Pub/Sub invalide: %v", err)
				continue
			}

			// Diffusion aux clients locaux appartenant aux cibles
			r.hub.BroadcastLocally(interMsg.TargetUserIDs, interMsg.Message)
		}
	}
}
