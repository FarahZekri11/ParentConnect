package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/parentconnect/messaging-service/internal/config"
	"github.com/parentconnect/messaging-service/internal/handlers"
	"github.com/parentconnect/messaging-service/internal/middleware"
	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/services"
	"github.com/parentconnect/messaging-service/internal/ws"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Mock repos en mémoire pour les tests WebSocket
type mockConvRepoWS struct {
	conv *models.Conversation
}

func (m *mockConvRepoWS) Create(ctx context.Context, c *models.Conversation) error { return nil }
func (m *mockConvRepoWS) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Conversation, error) {
	return m.conv, nil
}
func (m *mockConvRepoWS) FindDirectBetween(ctx context.Context, u1, u2 string) (*models.Conversation, error) {
	return m.conv, nil
}
func (m *mockConvRepoWS) ListByUser(ctx context.Context, u string, l, s int64) ([]models.Conversation, error) {
	return []models.Conversation{*m.conv}, nil
}
func (m *mockConvRepoWS) UpdateLastMessage(ctx context.Context, id primitive.ObjectID, lm *models.LastMessageSummary, t time.Time) error {
	return nil
}
func (m *mockConvRepoWS) IsParticipant(ctx context.Context, id primitive.ObjectID, u string) (bool, error) {
	return true, nil
}

type mockMsgRepoWS struct{}

func (m *mockMsgRepoWS) Create(ctx context.Context, msg *models.Message) error {
	msg.ID = primitive.NewObjectID()
	msg.CreatedAt = time.Now().UTC()
	return nil
}
func (m *mockMsgRepoWS) ListByConversation(ctx context.Context, id primitive.ObjectID, l int64, b *primitive.ObjectID) ([]models.Message, error) {
	return nil, nil
}
func (m *mockMsgRepoWS) CountByConversation(ctx context.Context, id primitive.ObjectID) (int64, error) {
	return 1, nil
}
func (m *mockMsgRepoWS) CountUnreadInConversation(ctx context.Context, id primitive.ObjectID, u string) (int64, error) {
	return 0, nil
}
func (m *mockMsgRepoWS) MarkAsRead(ctx context.Context, id primitive.ObjectID, u string) error {
	return nil
}

type mockNotifRepoWS struct{}

func (m *mockNotifRepoWS) Create(ctx context.Context, n *models.Notification) error { return nil }
func (m *mockNotifRepoWS) ListByUser(ctx context.Context, u string, l, s int64, unread bool) ([]models.Notification, int64, error) {
	return nil, 0, nil
}
func (m *mockNotifRepoWS) CountUnread(ctx context.Context, u string) (int64, error) { return 0, nil }
func (m *mockNotifRepoWS) MarkAsRead(ctx context.Context, id primitive.ObjectID, u string) error {
	return nil
}
func (m *mockNotifRepoWS) MarkAllAsRead(ctx context.Context, u string) error { return nil }

func generateTestToken(secret, userID string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &middleware.UserClaims{
		Role: "PARENT",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
		},
	})
	tokenStr, _ := token.SignedString([]byte(secret))
	return tokenStr
}

func TestWebSocket_ClientExchange(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := "test-secret-key-ws-parentconnect"
	cfg := &config.Config{
		JWTAlgorithm: "HS256",
		JWTSecret:    secret,
	}

	validator, err := middleware.NewTokenValidator(cfg)
	require.NoError(t, err)

	convID := primitive.NewObjectID()
	convRepo := &mockConvRepoWS{
		conv: &models.Conversation{
			ID:           convID,
			Type:         models.ConversationTypeDirect,
			Participants: []string{"user-alice", "user-bob"},
		},
	}
	msgRepo := &mockMsgRepoWS{}
	notifRepo := &mockNotifRepoWS{}

	msgService := services.NewMessagingService(convRepo, msgRepo, 2000)
	notifService := services.NewNotificationService(notifRepo)

	hub := ws.NewHub(msgService, notifService)
	serverCtx, serverCancel := context.WithCancel(context.Background())
	defer serverCancel()
	go hub.Run(serverCtx)

	wsHandler := handlers.NewWSHandler(hub, validator)

	router := gin.New()
	router.GET("/ws", wsHandler.ServeWS)

	server := httptest.NewServer(router)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	t.Run("Connexion WebSocket réussie avec token JWT", func(t *testing.T) {
		tokenAlice := generateTestToken(secret, "user-alice")
		dialer := websocket.Dialer{}

		connAlice, resp, err := dialer.Dial(wsURL+"?token="+tokenAlice, nil)
		require.NoError(t, err)
		defer connAlice.Close()
		assert.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)

		// Envoi d'un message depuis le client Alice
		sendPayload := ws.InboundMessage{
			Type:           ws.EventSendMessage,
			ConversationID: convID.Hex(),
			Payload: map[string]interface{}{
				"content": "Coucou Bob, es-tu libre pour le goûter partagé ?",
			},
		}
		err = connAlice.WriteJSON(sendPayload)
		require.NoError(t, err)

		// Lecture de la réponse ou diffusion
		_ = connAlice.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, message, err := connAlice.ReadMessage()
		require.NoError(t, err)

		var out ws.OutboundMessage
		err = json.Unmarshal(message, &out)
		require.NoError(t, err)
		assert.Equal(t, ws.EventNewMessage, out.Type)
		assert.Equal(t, convID.Hex(), out.ConversationID)
	})

	t.Run("Rejet de la connexion si token manquant", func(t *testing.T) {
		dialer := websocket.Dialer{}
		_, resp, err := dialer.Dial(wsURL, nil)
		assert.Error(t, err)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})
}
