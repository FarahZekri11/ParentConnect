package database

import (
	"context"
	"fmt"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// EnsureIndexes initialise tous les index optimisés pour le microservice Messaging
func (m *MongoDB) EnsureIndexes(ctx context.Context) error {
	if m == nil || m.Database == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	// 1. Index sur la collection "conversations"
	convCollection := m.Database.Collection("conversations")
	convIndexes := []mongo.IndexModel{
		{
			// Multikey index : recherche de toutes les conversations d'un utilisateur
			Keys:    bson.D{{Key: "participants", Value: 1}},
			Options: options.Index().SetName("idx_conversations_participants"),
		},
		{
			// Index composé : lister les conversations d'un utilisateur triées par activité récente
			Keys: bson.D{
				{Key: "participants", Value: 1},
				{Key: "updated_at", Value: -1},
			},
			Options: options.Index().SetName("idx_conversations_participants_updated_at"),
		},
	}
	if _, err := convCollection.Indexes().CreateMany(ctx, convIndexes); err != nil {
		return fmt.Errorf("erreur création index conversations: %w", err)
	}

	// 2. Index sur la collection "messages"
	msgCollection := m.Database.Collection("messages")
	msgIndexes := []mongo.IndexModel{
		{
			// Index composé crucial : historique chronologique paginé par conversation
			Keys: bson.D{
				{Key: "conversation_id", Value: 1},
				{Key: "created_at", Value: -1},
			},
			Options: options.Index().SetName("idx_messages_conversation_id_created_at"),
		},
	}
	if _, err := msgCollection.Indexes().CreateMany(ctx, msgIndexes); err != nil {
		return fmt.Errorf("erreur création index messages: %w", err)
	}

	// 3. Index sur la collection "notifications"
	notifCollection := m.Database.Collection("notifications")
	notifTTL := int32(90 * 24 * 3600) // Rétention 90 jours
	notifIndexes := []mongo.IndexModel{
		{
			// Index composé : compteur de notifications non-lues et récupération des notifications par parent
			Keys: bson.D{
				{Key: "user_id", Value: 1},
				{Key: "read", Value: 1},
				{Key: "created_at", Value: -1},
			},
			Options: options.Index().SetName("idx_notifications_user_read_created_at"),
		},
		{
			// Index TTL automatique : nettoyage après 90 jours
			Keys:    bson.D{{Key: "created_at", Value: 1}},
			Options: options.Index().SetName("idx_notifications_ttl_90d").SetExpireAfterSeconds(notifTTL),
		},
	}
	if _, err := notifCollection.Indexes().CreateMany(ctx, notifIndexes); err != nil {
		return fmt.Errorf("erreur création index notifications: %w", err)
	}

	// 4. Index sur la collection "processed_events"
	eventsCollection := m.Database.Collection("processed_events")
	eventsTTL := int32(30 * 24 * 3600) // Rétention 30 jours
	eventsIndexes := []mongo.IndexModel{
		{
			// Index TTL sur processed_at : purge automatique des clés d'idempotence après 30 jours
			// Note : _id étant déjà clé primaire unique dans MongoDB, l'unicité de event_id est native.
			Keys:    bson.D{{Key: "processed_at", Value: 1}},
			Options: options.Index().SetName("idx_processed_events_ttl_30d").SetExpireAfterSeconds(eventsTTL),
		},
	}
	if _, err := eventsCollection.Indexes().CreateMany(ctx, eventsIndexes); err != nil {
		return fmt.Errorf("erreur création index processed_events: %w", err)
	}

	log.Println("[INFO] Index MongoDB créés ou vérifiés avec succès")
	return nil
}
