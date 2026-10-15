package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ConversationType définit le type de contexte d'une conversation
type ConversationType string

const (
	ConversationTypeDirect      ConversationType = "DIRECT"
	ConversationTypeBabysitting ConversationType = "BABYSITTING"
	ConversationTypeMarketplace ConversationType = "MARKETPLACE"
	ConversationTypeEvent       ConversationType = "EVENT"
)

// ConversationContext stocke les métadonnées légères d'un contexte métier externe sans copier le profil
type ConversationContext struct {
	ReferenceID string `bson:"reference_id,omitempty" json:"reference_id,omitempty" example:"booking-uuid-1234"`
	Title       string `bson:"title,omitempty" json:"title,omitempty" example:"Garde d'enfants du samedi soir"`
}

// LastMessageSummary est une projection dénormalisée du dernier message envoyé,
// permettant d'afficher la liste des conversations sans requêtes N+1.
type LastMessageSummary struct {
	MessageID primitive.ObjectID `bson:"message_id,omitempty" json:"message_id,omitempty" example:"652f1e9b28b7a91234567890"`
	SenderID  string             `bson:"sender_id,omitempty" json:"sender_id,omitempty" example:"user-uuid-1"`
	Content   string             `bson:"content,omitempty" json:"content,omitempty" example:"Parfait, à tout à l'heure !"`
	CreatedAt time.Time          `bson:"created_at,omitempty" json:"created_at,omitempty" example:"2026-10-15T19:30:00Z"`
}

// Conversation représente une discussion entre deux ou plusieurs parents
type Conversation struct {
	ID           primitive.ObjectID   `bson:"_id,omitempty" json:"id" example:"652f1e9b28b7a91234567890"`
	Type         ConversationType     `bson:"type" json:"type" example:"BABYSITTING"`
	Context      *ConversationContext `bson:"context,omitempty" json:"context,omitempty"`
	Participants []string             `bson:"participants" json:"participants" example:"[\"user-uuid-1\",\"user-uuid-2\"]"`
	LastMessage  *LastMessageSummary  `bson:"last_message,omitempty" json:"last_message,omitempty"`
	CreatedAt    time.Time            `bson:"created_at" json:"created_at" example:"2026-10-15T18:00:00Z"`
	UpdatedAt    time.Time            `bson:"updated_at" json:"updated_at" example:"2026-10-15T19:30:00Z"`
}
