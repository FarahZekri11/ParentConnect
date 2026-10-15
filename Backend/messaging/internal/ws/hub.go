package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/services"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Hub maintient l'ensemble des clients WebSocket connectés localement
// et orchestre les diffusions via Redis Pub/Sub.
type Hub struct {
	// Clients indexés par UserID (un utilisateur peut avoir plusieurs onglets)
	clients    map[string]map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	mutex      sync.RWMutex

	msgService   services.MessagingService
	notifService services.NotificationService
	pubsub       *RedisPubSub
}

// NewHub crée une nouvelle instance du Hub
func NewHub(msgService services.MessagingService, notifService services.NotificationService) *Hub {
	return &Hub{
		clients:      make(map[string]map[*Client]bool),
		Register:     make(chan *Client),
		Unregister:   make(chan *Client),
		msgService:   msgService,
		notifService: notifService,
	}
}

// SetPubSub associe le gestionnaire Redis Pub/Sub au Hub
func (h *Hub) SetPubSub(pubsub *RedisPubSub) {
	h.pubsub = pubsub
}

// Run boucle principale de gestion des connexions/déconnexions
func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return

		case client := <-h.Register:
			h.mutex.Lock()
			if _, exists := h.clients[client.UserID]; !exists {
				h.clients[client.UserID] = make(map[*Client]bool)
			}
			h.clients[client.UserID][client] = true
			h.mutex.Unlock()
			log.Printf("[WS] Client connecté : user_id=%s (total connexions actives: %d)", client.UserID, h.activeConnectionsCount())

		case client := <-h.Unregister:
			h.mutex.Lock()
			if userClients, exists := h.clients[client.UserID]; exists {
				if _, ok := userClients[client]; ok {
					delete(userClients, client)
					close(client.Send)
					if len(userClients) == 0 {
						delete(h.clients, client.UserID)
					}
				}
			}
			h.mutex.Unlock()
			log.Printf("[WS] Client déconnecté : user_id=%s", client.UserID)
		}
	}
}

func (h *Hub) activeConnectionsCount() int {
	total := 0
	for _, conns := range h.clients {
		total += len(conns)
	}
	return total
}

// BroadcastLocally envoie le message aux clients connectés sur CETTE instance Go
func (h *Hub) BroadcastLocally(targetUserIDs []string, msg OutboundMessage) {
	bytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mutex.RLock()
	defer h.mutex.RUnlock()

	for _, uid := range targetUserIDs {
		if conns, exists := h.clients[uid]; exists {
			for client := range conns {
				select {
				case client.Send <- bytes:
				default:
					close(client.Send)
					delete(conns, client)
				}
			}
		}
	}
}

// BroadcastToUsers diffuse un message aux utilisateurs cibles, tant localement que sur les autres instances via Redis
func (h *Hub) BroadcastToUsers(ctx context.Context, targetUserIDs []string, msg OutboundMessage) {
	// 1. Diffusion locale immédiate
	h.BroadcastLocally(targetUserIDs, msg)

	// 2. Publication Redis Pub/Sub pour les autres conteneurs de l'essaim
	if h.pubsub != nil {
		_ = h.pubsub.Publish(ctx, targetUserIDs, msg)
	}
}

// HandleInbound traite les événements reçus depuis un client connecté
func (h *Hub) HandleInbound(client *Client, msg InboundMessage) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	switch msg.Type {
	case EventSendMessage:
		// Le client envoie un message en temps réel
		payloadMap, ok := msg.Payload.(map[string]interface{})
		if !ok {
			client.SendError("Payload invalide pour SEND_MESSAGE")
			return
		}
		content, _ := payloadMap["content"].(string)

		req := &models.SendMessageRequest{
			ConversationID: msg.ConversationID,
			Content:        content,
		}

		savedMsg, err := h.msgService.SendMessage(ctx, client.UserID, req)
		if err != nil {
			client.SendError("Impossible d'enregistrer le message: " + err.Error())
			return
		}

		// Récupérer la conversation pour connaître la liste des participants
		history, err := h.msgService.GetMessages(ctx, client.UserID, msg.ConversationID, 1, "")
		if err != nil {
			return
		}
		_ = history

		out := OutboundMessage{
			Type:           EventNewMessage,
			ConversationID: msg.ConversationID,
			Payload:        savedMsg,
			Timestamp:      time.Now().UTC().Format(time.RFC3339),
		}

		// Diffusion (l'expéditeur et les destinataires reçoivent l'événement)
		// On diffuse à la conversation (participants)
		convID, err := primitive.ObjectIDFromHex(msg.ConversationID)
		if err == nil {
			_ = convID
		}
		// Notifier les participants : pour l'instant via BroadcastToUsers
		// Si on a l'info participants, on diffuse aux destinataires
		h.BroadcastLocally([]string{client.UserID}, out)
		if h.pubsub != nil {
			_ = h.pubsub.Publish(ctx, []string{client.UserID}, out)
		}

	case EventTyping:
		// Indicateur de frappe "en train d'écrire..."
		payloadMap, ok := msg.Payload.(map[string]interface{})
		isTyping := true
		if ok {
			if it, exists := payloadMap["is_typing"].(bool); exists {
				isTyping = it
			}
		}

		out := OutboundMessage{
			Type:           EventUserTyping,
			ConversationID: msg.ConversationID,
			Payload: TypingPayload{
				UserID:   client.UserID,
				IsTyping: isTyping,
			},
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}

		// Transmettre à la conversation
		if h.pubsub != nil {
			_ = h.pubsub.Publish(ctx, nil, out)
		}

	case EventMarkRead:
		// Marquer conversation comme lue
		if msg.ConversationID != "" {
			_ = h.msgService.MarkConversationAsRead(ctx, client.UserID, msg.ConversationID)
			out := OutboundMessage{
				Type:           EventMessageRead,
				ConversationID: msg.ConversationID,
				Payload: ReadReceiptPayload{
					ConversationID: msg.ConversationID,
					UserID:         client.UserID,
					ReadAt:         time.Now().UTC(),
				},
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			}
			h.BroadcastToUsers(ctx, []string{client.UserID}, out)
		}
	}
}
