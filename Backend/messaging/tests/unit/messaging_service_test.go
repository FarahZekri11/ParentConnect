package unit

import (
	"context"
	"testing"
	"time"

	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// MockConversationRepository implémentation en mémoire pour les tests unitaires
type MockConversationRepository struct {
	conversations map[primitive.ObjectID]*models.Conversation
}

func NewMockConversationRepository() *MockConversationRepository {
	return &MockConversationRepository{conversations: make(map[primitive.ObjectID]*models.Conversation)}
}

func (m *MockConversationRepository) Create(ctx context.Context, conv *models.Conversation) error {
	conv.ID = primitive.NewObjectID()
	conv.CreatedAt = time.Now()
	conv.UpdatedAt = conv.CreatedAt
	m.conversations[conv.ID] = conv
	return nil
}

func (m *MockConversationRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Conversation, error) {
	return m.conversations[id], nil
}

func (m *MockConversationRepository) FindDirectBetween(ctx context.Context, user1, user2 string) (*models.Conversation, error) {
	for _, c := range m.conversations {
		if c.Type == models.ConversationTypeDirect && len(c.Participants) == 2 {
			p1, p2 := c.Participants[0], c.Participants[1]
			if (p1 == user1 && p2 == user2) || (p1 == user2 && p2 == user1) {
				return c, nil
			}
		}
	}
	return nil, nil
}

func (m *MockConversationRepository) ListByUser(ctx context.Context, userID string, limit, skip int64) ([]models.Conversation, error) {
	var list []models.Conversation
	for _, c := range m.conversations {
		for _, p := range c.Participants {
			if p == userID {
				list = append(list, *c)
				break
			}
		}
	}
	return list, nil
}

func (m *MockConversationRepository) UpdateLastMessage(ctx context.Context, convID primitive.ObjectID, lastMsg *models.LastMessageSummary, updatedAt time.Time) error {
	if c, ok := m.conversations[convID]; ok {
		c.LastMessage = lastMsg
		c.UpdatedAt = updatedAt
	}
	return nil
}

func (m *MockConversationRepository) IsParticipant(ctx context.Context, convID primitive.ObjectID, userID string) (bool, error) {
	c, ok := m.conversations[convID]
	if !ok {
		return false, nil
	}
	for _, p := range c.Participants {
		if p == userID {
			return true, nil
		}
	}
	return false, nil
}

// MockMessageRepository
type MockMessageRepository struct {
	messages map[primitive.ObjectID]*models.Message
}

func NewMockMessageRepository() *MockMessageRepository {
	return &MockMessageRepository{messages: make(map[primitive.ObjectID]*models.Message)}
}

func (m *MockMessageRepository) Create(ctx context.Context, msg *models.Message) error {
	msg.ID = primitive.NewObjectID()
	msg.CreatedAt = time.Now()
	m.messages[msg.ID] = msg
	return nil
}

func (m *MockMessageRepository) ListByConversation(ctx context.Context, convID primitive.ObjectID, limit int64, beforeID *primitive.ObjectID) ([]models.Message, error) {
	var list []models.Message
	for _, msg := range m.messages {
		if msg.ConversationID == convID {
			list = append(list, *msg)
		}
	}
	return list, nil
}

func (m *MockMessageRepository) CountByConversation(ctx context.Context, convID primitive.ObjectID) (int64, error) {
	var count int64
	for _, msg := range m.messages {
		if msg.ConversationID == convID {
			count++
		}
	}
	return count, nil
}

func (m *MockMessageRepository) CountUnreadInConversation(ctx context.Context, convID primitive.ObjectID, userID string) (int64, error) {
	return 0, nil
}

func (m *MockMessageRepository) MarkAsRead(ctx context.Context, convID primitive.ObjectID, userID string) error {
	return nil
}

// ==========================================
// Tests unitaires
// ==========================================

func TestMessagingService_ValidationRules(t *testing.T) {
	convRepo := NewMockConversationRepository()
	msgRepo := NewMockMessageRepository()
	service := services.NewMessagingService(convRepo, msgRepo, 100) // max 100 caractères pour le test

	ctx := context.Background()

	t.Run("Rejet conversation avec soi-même", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Type:         models.ConversationTypeDirect,
			Participants: []string{"user-alice"}, // Pas de deuxième participant
		}
		_, _, err := service.CreateConversation(ctx, "user-alice", req)
		assert.ErrorIs(t, err, services.ErrSelfConversation)
	})

	t.Run("Création et idempotence d'une conversation directe", func(t *testing.T) {
		req := &models.CreateConversationRequest{
			Type:         models.ConversationTypeDirect,
			Participants: []string{"user-bob"},
		}
		conv1, isNew, err := service.CreateConversation(ctx, "user-alice", req)
		require.NoError(t, err)
		assert.True(t, isNew)

		// Deuxième appel avec les deux mêmes parents
		conv2, isNew2, err2 := service.CreateConversation(ctx, "user-bob", &models.CreateConversationRequest{
			Type:         models.ConversationTypeDirect,
			Participants: []string{"user-alice"},
		})
		require.NoError(t, err2)
		assert.False(t, isNew2)
		assert.Equal(t, conv1.ID, conv2.ID)
	})

	t.Run("Rejet de message vide", func(t *testing.T) {
		req := &models.SendMessageRequest{
			ConversationID: primitive.NewObjectID().Hex(),
			Content:        "   ",
		}
		_, err := service.SendMessage(ctx, "user-alice", req)
		assert.ErrorIs(t, err, services.ErrEmptyMessage)
	})

	t.Run("Rejet si message dépasse MAX_MESSAGE_LENGTH", func(t *testing.T) {
		longText := string(make([]byte, 105)) // 105 > limite de 100
		req := &models.SendMessageRequest{
			ConversationID: primitive.NewObjectID().Hex(),
			Content:        longText,
		}
		_, err := service.SendMessage(ctx, "user-alice", req)
		assert.ErrorIs(t, err, services.ErrMessageTooLong)
	})

	t.Run("Rejet si l'utilisateur n'est pas participant", func(t *testing.T) {
		convReq := &models.CreateConversationRequest{
			Type:         models.ConversationTypeDirect,
			Participants: []string{"user-bob"},
		}
		conv, _, _ := service.CreateConversation(ctx, "user-alice", convReq)

		sendReq := &models.SendMessageRequest{
			ConversationID: conv.ID.Hex(),
			Content:        "Hello !",
		}
		// user-chloe tente d'écrire dans la conversation d'Alice et Bob
		_, err := service.SendMessage(ctx, "user-chloe", sendReq)
		assert.ErrorIs(t, err, services.ErrForbidden)
	})

	t.Run("Neutralisation anti-XSS des messages", func(t *testing.T) {
		convReq := &models.CreateConversationRequest{
			Type:         models.ConversationTypeDirect,
			Participants: []string{"user-bob"},
		}
		conv, _, _ := service.CreateConversation(ctx, "user-alice", convReq)

		maliciousReq := &models.SendMessageRequest{
			ConversationID: conv.ID.Hex(),
			Content:        "<script>alert('pwned')</script> Salut Bob !",
		}
		msg, err := service.SendMessage(ctx, "user-alice", maliciousReq)
		require.NoError(t, err)
		assert.Equal(t, "&lt;script&gt;alert(&#39;pwned&#39;)&lt;/script&gt; Salut Bob !", msg.Content)
	})
}
