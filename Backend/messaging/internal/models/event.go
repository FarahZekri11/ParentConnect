package models

import (
	"time"
)

// EventEnvelope représente le format standard partagé de tous les messages du bus RabbitMQ
type EventEnvelope struct {
	EventID    string                 `json:"event_id" example:"evt-uuid-550e8400-e29b-41d4-a716-446655440000"`
	Type       string                 `json:"type" example:"BookingAccepted"`
	Version    string                 `json:"version" example:"1.0"`
	OccurredAt time.Time              `json:"occurred_at" example:"2026-10-15T19:30:00Z"`
	Data       map[string]interface{} `json:"data"`
}

// ProcessedEvent garantit l'idempotence des réceptions d'événements RabbitMQ.
// En utilisant l'event_id comme _id MongoDB, l'insertion échoue automatiquement en cas de doublon.
type ProcessedEvent struct {
	ID          string    `bson:"_id" json:"event_id"`
	EventType   string    `bson:"event_type" json:"event_type"`
	ProcessedAt time.Time `bson:"processed_at" json:"processed_at"`
}
