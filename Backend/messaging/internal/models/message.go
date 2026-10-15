package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ReadReceipt représente l'accusé de lecture d'un participant
type ReadReceipt struct {
	UserID string    `bson:"user_id" json:"user_id" example:"user-uuid-2"`
	ReadAt time.Time `bson:"read_at" json:"read_at" example:"2026-10-15T19:35:00Z"`
}

// Message représente un message textuel échangé dans une conversation
type Message struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id" example:"652f201c28b7a91234567891"`
	ConversationID primitive.ObjectID `bson:"conversation_id" json:"conversation_id" example:"652f1e9b28b7a91234567890"`
	SenderID       string             `bson:"sender_id" json:"sender_id" example:"user-uuid-1"`
	Content        string             `bson:"content" json:"content" example:"Bonjour ! Peux-tu garder les enfants ce soir ?"`
	ReadBy         []ReadReceipt      `bson:"read_by" json:"read_by"`
	CreatedAt      time.Time          `bson:"created_at" json:"created_at" example:"2026-10-15T19:30:00Z"`
}
