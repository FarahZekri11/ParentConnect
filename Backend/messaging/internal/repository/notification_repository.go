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

// NotificationRepository interface définissant les opérations d'accès aux notifications
type NotificationRepository interface {
	Create(ctx context.Context, notif *models.Notification) error
	ListByUser(ctx context.Context, userID string, limit, skip int64, unreadOnly bool) ([]models.Notification, int64, error)
	CountUnread(ctx context.Context, userID string) (int64, error)
	MarkAsRead(ctx context.Context, id primitive.ObjectID, userID string) error
	MarkAllAsRead(ctx context.Context, userID string) error
}

type notificationRepo struct {
	collection *mongo.Collection
}

// NewNotificationRepository instancie le repository MongoDB pour les notifications
func NewNotificationRepository(db *mongo.Database) NotificationRepository {
	return &notificationRepo{
		collection: db.Collection("notifications"),
	}
}

func (r *notificationRepo) Create(ctx context.Context, notif *models.Notification) error {
	notif.CreatedAt = time.Now().UTC()
	notif.Read = false
	res, err := r.collection.InsertOne(ctx, notif)
	if err != nil {
		return fmt.Errorf("erreur insertion notification: %w", err)
	}
	notif.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (r *notificationRepo) ListByUser(ctx context.Context, userID string, limit, skip int64, unreadOnly bool) ([]models.Notification, int64, error) {
	filter := bson.M{"user_id": userID}
	if unreadOnly {
		filter["read"] = false
	}

	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetLimit(limit).
		SetSkip(skip)

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, fmt.Errorf("erreur récupération notifications: %w", err)
	}
	defer cursor.Close(ctx)

	var list []models.Notification
	if err := cursor.All(ctx, &list); err != nil {
		return nil, 0, fmt.Errorf("erreur décodage notifications: %w", err)
	}
	if list == nil {
		list = []models.Notification{}
	}

	return list, total, nil
}

func (r *notificationRepo) CountUnread(ctx context.Context, userID string) (int64, error) {
	return r.collection.CountDocuments(ctx, bson.M{
		"user_id": userID,
		"read":    false,
	})
}

func (r *notificationRepo) MarkAsRead(ctx context.Context, id primitive.ObjectID, userID string) error {
	filter := bson.M{
		"_id":     id,
		"user_id": userID,
	}
	update := bson.M{"$set": bson.M{"read": true}}
	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

func (r *notificationRepo) MarkAllAsRead(ctx context.Context, userID string) error {
	filter := bson.M{
		"user_id": userID,
		"read":    false,
	}
	update := bson.M{"$set": bson.M{"read": true}}
	_, err := r.collection.UpdateMany(ctx, filter, update)
	return err
}
