package ws

import "time"

// EventType définit les types d'événements échangés via la connexion WebSocket
type EventType string

const (
	// Du Client vers le Serveur
	EventSendMessage   EventType = "SEND_MESSAGE"
	EventTyping        EventType = "TYPING"
	EventMarkRead      EventType = "MARK_READ"

	// Du Serveur vers le Client
	EventNewMessage    EventType = "NEW_MESSAGE"
	EventUserTyping    EventType = "USER_TYPING"
	EventMessageRead   EventType = "MESSAGE_READ"
	EventNotification  EventType = "NOTIFICATION"
	EventPresence      EventType = "PRESENCE"
	EventError         EventType = "ERROR"
)

// InboundMessage représente un message envoyé par le frontend
type InboundMessage struct {
	Type           EventType   `json:"type"`
	ConversationID string      `json:"conversation_id,omitempty"`
	Payload        interface{} `json:"payload"`
}

// OutboundMessage représente la trame standardisée envoyée au client frontend
type OutboundMessage struct {
	Type           EventType   `json:"type"`
	ConversationID string      `json:"conversation_id,omitempty"`
	Payload        interface{} `json:"payload"`
	Timestamp      string      `json:"timestamp"`
}

// TypingPayload payload pour l'indicateur "en train d'écrire..."
type TypingPayload struct {
	UserID   string `json:"user_id"`
	IsTyping bool   `json:"is_typing"`
}

// ReadReceiptPayload payload pour notifier de la lecture d'une conversation
type ReadReceiptPayload struct {
	ConversationID string    `json:"conversation_id"`
	UserID         string    `json:"user_id"`
	ReadAt         time.Time `json:"read_at"`
}

// InterInstanceMessage trame sérialisée dans Redis Pub/Sub pour le scaling multi-instances
type InterInstanceMessage struct {
	TargetUserIDs []string        `json:"target_user_ids"`
	Message       OutboundMessage `json:"message"`
}
