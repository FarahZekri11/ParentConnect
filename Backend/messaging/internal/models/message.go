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
	// Nom affiché de l'expéditeur, issu du token vérifié (jamais fourni par le client)
	SenderName string `bson:"sender_name,omitempty" json:"sender_name,omitempty" example:"Marie Lambert"`
	Content    string `bson:"content" json:"content" example:"Bonjour ! Peux-tu garder les enfants ce soir ?"`
	// Images jointes (stockées par le service, servies uniquement aux participants)
	Attachments []Attachment  `bson:"attachments,omitempty" json:"attachments,omitempty"`
	ReadBy      []ReadReceipt `bson:"read_by" json:"read_by"`
	CreatedAt   time.Time     `bson:"created_at" json:"created_at" example:"2026-10-15T19:30:00Z"`
	// Date de dernière modification par l'expéditeur
	EditedAt *time.Time `bson:"edited_at,omitempty" json:"edited_at,omitempty"`
	// Message supprimé par son expéditeur (le contenu et les pièces jointes sont effacés)
	Deleted bool `bson:"deleted,omitempty" json:"deleted,omitempty"`
}

// Attachment décrit une image jointe à un message
type Attachment struct {
	ID          string `bson:"id" json:"id" example:"0f8fad5b-d9cb-469f-a165-70867728950e.jpg"`
	ContentType string `bson:"content_type" json:"content_type" example:"image/jpeg"`
	Size        int64  `bson:"size" json:"size" example:"204800"`
}
