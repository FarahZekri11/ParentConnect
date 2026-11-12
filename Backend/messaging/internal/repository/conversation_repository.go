package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/parentconnect/messaging-service/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ConversationRepository interface définissant les opérations sur les conversations
type ConversationRepository interface {
	Create(ctx context.Context, conv *models.Conversation) error
	GetByID(ctx context.Context, id primitive.ObjectID) (*models.Conversation, error)
	FindDirectBetween(ctx context.Context, user1, user2 string) (*models.Conversation, error)
	ListByUser(ctx context.Context, userID string, limit, skip int64) ([]models.Conversation, error)
	UpdateLastMessage(ctx context.Context, convID primitive.ObjectID, lastMsg *models.LastMessageSummary, updatedAt time.Time) error
	IsParticipant(ctx context.Context, convID primitive.ObjectID, userID string) (bool, error)
}

type conversationRepo struct {
	collection *mongo.Collection
}

// NewConversationRepository instancie le repository MongoDB pour les conversations
func NewConversationRepository(db *mongo.Database) ConversationRepository {
	return &conversationRepo{
		collection: db.Collection("conversations"),
	}
}

func (r *conversationRepo) Create(ctx context.Context, conv *models.Conversation) error {
	conv.CreatedAt = time.Now().UTC()
	conv.UpdatedAt = conv.CreatedAt
	res, err := r.collection.InsertOne(ctx, conv)
	if err != nil {
		return fmt.Errorf("erreur création conversation: %w", err)
	}
	conv.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (r *conversationRepo) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Conversation, error) {
	var conv models.Conversation
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&conv)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, fmt.Errorf("erreur lecture conversation: %w", err)
	}
	return &conv, nil
}

func (r *conversationRepo) FindDirectBetween(ctx context.Context, user1, user2 string) (*models.Conversation, error) {
	filter := bson.M{
		"type": models.ConversationTypeDirect,
		"participants": bson.M{
			"$all":  []string{user1, user2},
			"$size": 2,
		},
	}
	var conv models.Conversation
	err := r.collection.FindOne(ctx, filter).Decode(&conv)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	return &conv, nil
}

func (r *conversationRepo) ListByUser(ctx context.Context, userID string, limit, skip int64) ([]models.Conversation, error) {
	filter := bson.M{"participants": userID}
	opts := options.Find().
		SetSort(bson.D{{Key: "updated_at", Value: -1}}).
		SetLimit(limit).
		SetSkip(skip)

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("erreur listage conversations: %w", err)
	}
	defer cursor.Close(ctx)

	var list []models.Conversation
	if err := cursor.All(ctx, &list); err != nil {
		return nil, fmt.Errorf("erreur décodage conversations: %w", err)
	}
	if list == nil {
		list = []models.Conversation{}
	}
	return list, nil
}

func (r *conversationRepo) UpdateLastMessage(ctx context.Context, convID primitive.ObjectID, lastMsg *models.LastMessageSummary, updatedAt time.Time) error {
	update := bson.M{
		"$set": bson.M{
			"last_message": lastMsg,
			"updated_at":   updatedAt,
		},
	}
	_, err := r.collection.UpdateOne(ctx, bson.M{"_id": convID}, update)
	return err
}

func (r *conversationRepo) IsParticipant(ctx context.Context, convID primitive.ObjectID, userID string) (bool, error) {
	filter := bson.M{
		"_id":          convID,
		"participants": userID,
	}
	count, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
