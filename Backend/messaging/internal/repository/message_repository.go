package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/parentconnect/messaging-service/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MessageRepository interface définissant les opérations d'accès aux messages
type MessageRepository interface {
	Create(ctx context.Context, msg *models.Message) error
	ListByConversation(ctx context.Context, convID primitive.ObjectID, limit int64, beforeID *primitive.ObjectID) ([]models.Message, error)
	CountByConversation(ctx context.Context, convID primitive.ObjectID) (int64, error)
	CountUnreadInConversation(ctx context.Context, convID primitive.ObjectID, userID string) (int64, error)
	MarkAsRead(ctx context.Context, convID primitive.ObjectID, userID string) error
}

type messageRepo struct {
	collection *mongo.Collection
}

// NewMessageRepository instancie le repository MongoDB pour les messages
func NewMessageRepository(db *mongo.Database) MessageRepository {
	return &messageRepo{
		collection: db.Collection("messages"),
	}
}

func (r *messageRepo) Create(ctx context.Context, msg *models.Message) error {
	msg.CreatedAt = time.Now().UTC()
	if msg.ReadBy == nil {
		msg.ReadBy = []models.ReadReceipt{
			{UserID: msg.SenderID, ReadAt: msg.CreatedAt},
		}
	}
	res, err := r.collection.InsertOne(ctx, msg)
	if err != nil {
		return fmt.Errorf("erreur insertion message: %w", err)
	}
	msg.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (r *messageRepo) ListByConversation(ctx context.Context, convID primitive.ObjectID, limit int64, beforeID *primitive.ObjectID) ([]models.Message, error) {
	filter := bson.M{"conversation_id": convID}

	if beforeID != nil {
		filter["_id"] = bson.M{"$lt": *beforeID}
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: -1}}). // Les plus récents d'abord
		SetLimit(limit)

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("erreur récupération messages: %w", err)
	}
	defer cursor.Close(ctx)

	var list []models.Message
	if err := cursor.All(ctx, &list); err != nil {
		return nil, fmt.Errorf("erreur décodage messages: %w", err)
	}
	if list == nil {
		list = []models.Message{}
	}

	// Inverser l'ordre pour les renvoyer dans l'ordre chronologique croissant (chat standard)
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}

	return list, nil
}

func (r *messageRepo) CountByConversation(ctx context.Context, convID primitive.ObjectID) (int64, error) {
	return r.collection.CountDocuments(ctx, bson.M{"conversation_id": convID})
}

func (r *messageRepo) CountUnreadInConversation(ctx context.Context, convID primitive.ObjectID, userID string) (int64, error) {
	filter := bson.M{
		"conversation_id": convID,
		"sender_id":       bson.M{"$ne": userID},
		"read_by.user_id": bson.M{"$ne": userID},
	}
	return r.collection.CountDocuments(ctx, filter)
}

func (r *messageRepo) MarkAsRead(ctx context.Context, convID primitive.ObjectID, userID string) error {
	filter := bson.M{
		"conversation_id": convID,
		"sender_id":       bson.M{"$ne": userID},
		"read_by.user_id": bson.M{"$ne": userID},
	}
	update := bson.M{
		"$push": bson.M{
			"read_by": models.ReadReceipt{
				UserID: userID,
				ReadAt: time.Now().UTC(),
			},
		},
	}
	_, err := r.collection.UpdateMany(ctx, filter, update)
	return err
}
