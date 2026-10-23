package events

import (
	"context"
	"time"

	"github.com/parentconnect/messaging-service/internal/models"
	"go.mongodb.org/mongo-driver/mongo"
)

// IdempotenceChecker assure qu'un même événement RabbitMQ n'est traité qu'une seule fois
type IdempotenceChecker interface {
	CheckAndMark(ctx context.Context, eventID, eventType string) (bool, error)
}

type mongoIdempotenceChecker struct {
	collection *mongo.Collection
}

// NewIdempotenceChecker initialise le vérificateur d'idempotence s'appuyant sur MongoDB
func NewIdempotenceChecker(db *mongo.Database) IdempotenceChecker {
	return &mongoIdempotenceChecker{
		collection: db.Collection("processed_events"),
	}
}

// CheckAndMark tente d'insérer l'événement dans processed_events.
// Si l'insertion réussit, retourne true (premier traitement).
// Si l'insertion échoue pour clé dupliquée (duplicate key error), retourne false (événement déjà traité).
func (c *mongoIdempotenceChecker) CheckAndMark(ctx context.Context, eventID, eventType string) (bool, error) {
	record := models.ProcessedEvent{
		ID:          eventID,
		EventType:   eventType,
		ProcessedAt: time.Now().UTC(),
	}

	_, err := c.collection.InsertOne(ctx, record)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return false, nil // Déjà traité
		}
		return false, err
	}

	return true, nil
}
