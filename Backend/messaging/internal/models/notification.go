package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// NotificationType liste les types d'événements notifiés aux parents
type NotificationType string

const (
	NotificationTypeNewMessage         NotificationType = "NEW_MESSAGE"
	NotificationTypeBookingAccepted    NotificationType = "BOOKING_ACCEPTED"
	NotificationTypeNewNeighborJoined  NotificationType = "NEW_NEIGHBOR_JOINED"
	NotificationTypeMarketplaceRequest NotificationType = "MARKETPLACE_REQUEST"
	NotificationTypeEventRegistration  NotificationType = "EVENT_REGISTRATION"
)

// Notification représente une alerte adressée à un parent spécifique
type Notification struct {
	ID        primitive.ObjectID     `bson:"_id,omitempty" json:"id" example:"652f20aa28b7a91234567892"`
	UserID    string                 `bson:"user_id" json:"user_id" example:"user-uuid-1"`
	Type      NotificationType       `bson:"type" json:"type" example:"BOOKING_ACCEPTED"`
	Title     string                 `bson:"title" json:"title" example:"Demande acceptée"`
	Message   string                 `bson:"message" json:"message" example:"Sophie a accepté votre demande de babysitting."`
	Payload   map[string]interface{} `bson:"payload,omitempty" json:"payload,omitempty"`
	Read      bool                   `bson:"read" json:"read" example:"false"`
	CreatedAt time.Time              `bson:"created_at" json:"created_at" example:"2026-10-15T19:30:00Z"`
}
