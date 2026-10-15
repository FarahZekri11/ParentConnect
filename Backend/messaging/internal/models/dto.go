package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// StandardResponse structure de retour unifiée
type StandardResponse struct {
	Success bool        `json:"success" example:"true"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty" example:""`
}

// CreateConversationRequest DTO de création d'une conversation
type CreateConversationRequest struct {
	Type         ConversationType     `json:"type" binding:"required,oneof=DIRECT BABYSITTING MARKETPLACE EVENT" example:"DIRECT"`
	Participants []string             `json:"participants" binding:"required,min=1" example:"[\"user-uuid-2\"]"`
	Context      *ConversationContext `json:"context,omitempty"`
}

// SendMessageRequest DTO d'envoi d'un message
type SendMessageRequest struct {
	ConversationID string `json:"conversation_id" binding:"required" example:"652f1e9b28b7a91234567890"`
	Content        string `json:"content" binding:"required,min=1" example:"Bonjour, es-tu disponible samedi pour garder Lucas ?"`
}

// MessageHistoryResponse DTO de retour pour les messages avec métadonnées de pagination
type MessageHistoryResponse struct {
	Messages   []Message `json:"messages"`
	Total      int64     `json:"total"`
	NextCursor string    `json:"next_cursor,omitempty" example:"652f201c28b7a91234567888"`
	HasMore    bool      `json:"has_more"`
}

// ConversationResponse DTO enrichi pour l'affichage dans le frontend
type ConversationResponse struct {
	ID           primitive.ObjectID   `json:"id"`
	Type         ConversationType     `json:"type"`
	Context      *ConversationContext `json:"context,omitempty"`
	Participants []string             `json:"participants"`
	LastMessage  *LastMessageSummary  `json:"last_message,omitempty"`
	UnreadCount  int64                `json:"unread_count"`
	CreatedAt    time.Time            `json:"created_at"`
	UpdatedAt    time.Time            `json:"updated_at"`
}

// NotificationListResponse DTO de retour pour les notifications
type NotificationListResponse struct {
	Notifications []Notification `json:"notifications"`
	Total         int64          `json:"total"`
	UnreadCount   int64          `json:"unread_count"`
}

// UnreadCountResponse DTO pour le badge de la cloche
type UnreadCountResponse struct {
	UnreadCount int64 `json:"unread_count" example:"3"`
}
