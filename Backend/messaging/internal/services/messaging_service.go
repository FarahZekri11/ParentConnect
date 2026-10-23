package services

import (
	"context"
	"errors"
	"fmt"
	"html"
	"strings"

	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/repository"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrForbidden          = errors.New("accès interdit : vous ne faites pas partie de cette conversation")
	ErrNotFound           = errors.New("ressource introuvable")
	ErrInvalidID          = errors.New("identifiant invalide")
	ErrMessageTooLong     = errors.New("le message dépasse la longueur maximale autorisée")
	ErrEmptyMessage       = errors.New("le contenu du message ne peut pas être vide")
	ErrSelfConversation   = errors.New("impossible de démarrer une conversation avec soi-même")
	ErrInvalidParticipant = errors.New("participant invalide")
)

// MessagingService interface métier pour la messagerie
type MessagingService interface {
	CreateConversation(ctx context.Context, currentUserID string, req *models.CreateConversationRequest) (*models.Conversation, bool, error)
	ListConversations(ctx context.Context, currentUserID string, page, limit int64) ([]models.ConversationResponse, error)
	GetMessages(ctx context.Context, currentUserID, convIDStr string, limit int64, beforeIDStr string) (*models.MessageHistoryResponse, error)
	SendMessage(ctx context.Context, currentUserID string, req *models.SendMessageRequest) (*models.Message, error)
	MarkConversationAsRead(ctx context.Context, currentUserID, convIDStr string) error
}

type messagingService struct {
	convRepo         repository.ConversationRepository
	msgRepo          repository.MessageRepository
	maxMessageLength int
}

// NewMessagingService crée le service métier de messagerie
func NewMessagingService(convRepo repository.ConversationRepository, msgRepo repository.MessageRepository, maxLen int) MessagingService {
	return &messagingService{
		convRepo:         convRepo,
		msgRepo:          msgRepo,
		maxMessageLength: maxLen,
	}
}

func (s *messagingService) CreateConversation(ctx context.Context, currentUserID string, req *models.CreateConversationRequest) (*models.Conversation, bool, error) {
	// Consolidation de la liste des participants
	participantSet := make(map[string]bool)
	participantSet[currentUserID] = true

	for _, p := range req.Participants {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			participantSet[trimmed] = true
		}
	}

	participants := make([]string, 0, len(participantSet))
	for p := range participantSet {
		participants = append(participants, p)
	}

	if len(participants) < 2 {
		return nil, false, ErrSelfConversation
	}

	// Idempotence : si type DIRECT entre 2 parents, réutiliser la conversation existante
	if req.Type == models.ConversationTypeDirect && len(participants) == 2 {
		existing, err := s.convRepo.FindDirectBetween(ctx, participants[0], participants[1])
		if err != nil {
			return nil, false, err
		}
		if existing != nil {
			return existing, false, nil // false = déjà existante
		}
	}

	conv := &models.Conversation{
		Type:         req.Type,
		Context:      req.Context,
		Participants: participants,
	}

	if err := s.convRepo.Create(ctx, conv); err != nil {
		return nil, false, err
	}

	return conv, true, nil // true = nouvellement créée
}

func (s *messagingService) ListConversations(ctx context.Context, currentUserID string, page, limit int64) ([]models.ConversationResponse, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	skip := (page - 1) * limit

	convs, err := s.convRepo.ListByUser(ctx, currentUserID, limit, skip)
	if err != nil {
		return nil, err
	}

	responses := make([]models.ConversationResponse, len(convs))
	for i, c := range convs {
		unread, err := s.msgRepo.CountUnreadInConversation(ctx, c.ID, currentUserID)
		if err != nil {
			unread = 0
		}

		responses[i] = models.ConversationResponse{
			ID:           c.ID,
			Type:         c.Type,
			Context:      c.Context,
			Participants: c.Participants,
			LastMessage:  c.LastMessage,
			UnreadCount:  unread,
			CreatedAt:    c.CreatedAt,
			UpdatedAt:    c.UpdatedAt,
		}
	}

	return responses, nil
}

func (s *messagingService) GetMessages(ctx context.Context, currentUserID, convIDStr string, limit int64, beforeIDStr string) (*models.MessageHistoryResponse, error) {
	convID, err := primitive.ObjectIDFromHex(convIDStr)
	if err != nil {
		return nil, ErrInvalidID
	}

	// Contrôle d'accès strict : l'utilisateur doit être participant
	isParticipant, err := s.convRepo.IsParticipant(ctx, convID, currentUserID)
	if err != nil {
		return nil, err
	}
	if !isParticipant {
		return nil, ErrForbidden
	}

	if limit < 1 || limit > 100 {
		limit = 50
	}

	var beforeID *primitive.ObjectID
	if beforeIDStr != "" {
		bid, err := primitive.ObjectIDFromHex(beforeIDStr)
		if err == nil {
			beforeID = &bid
		}
	}

	messages, err := s.msgRepo.ListByConversation(ctx, convID, limit, beforeID)
	if err != nil {
		return nil, err
	}

	total, err := s.msgRepo.CountByConversation(ctx, convID)
	if err != nil {
		total = int64(len(messages))
	}

	var nextCursor string
	hasMore := false
	if len(messages) > 0 {
		// Le premier message renvoyé (le plus ancien de la tranche actuelle) donne le curseur pour remonter plus loin
		nextCursor = messages[0].ID.Hex()
		hasMore = int64(len(messages)) == limit
	}

	return &models.MessageHistoryResponse{
		Messages:   messages,
		Total:      total,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

func (s *messagingService) SendMessage(ctx context.Context, currentUserID string, req *models.SendMessageRequest) (*models.Message, error) {
	cleanContent := html.EscapeString(strings.TrimSpace(req.Content))
	if cleanContent == "" {
		return nil, ErrEmptyMessage
	}
	if len(cleanContent) > s.maxMessageLength {
		return nil, fmt.Errorf("%w (%d caractères max)", ErrMessageTooLong, s.maxMessageLength)
	}

	convID, err := primitive.ObjectIDFromHex(req.ConversationID)
	if err != nil {
		return nil, ErrInvalidID
	}

	// Contrôle d'appartenance
	isParticipant, err := s.convRepo.IsParticipant(ctx, convID, currentUserID)
	if err != nil {
		return nil, err
	}
	if !isParticipant {
		return nil, ErrForbidden
	}

	msg := &models.Message{
		ConversationID: convID,
		SenderID:       currentUserID,
		Content:        cleanContent,
	}

	if err := s.msgRepo.Create(ctx, msg); err != nil {
		return nil, err
	}

	// Mise à jour dénormalisée du dernier message dans la conversation
	lastMsg := &models.LastMessageSummary{
		MessageID: msg.ID,
		SenderID:  msg.SenderID,
		Content:   msg.Content,
		CreatedAt: msg.CreatedAt,
	}
	_ = s.convRepo.UpdateLastMessage(ctx, convID, lastMsg, msg.CreatedAt)

	return msg, nil
}

func (s *messagingService) MarkConversationAsRead(ctx context.Context, currentUserID, convIDStr string) error {
	convID, err := primitive.ObjectIDFromHex(convIDStr)
	if err != nil {
		return ErrInvalidID
	}

	isParticipant, err := s.convRepo.IsParticipant(ctx, convID, currentUserID)
	if err != nil {
		return err
	}
	if !isParticipant {
		return ErrForbidden
	}

	return s.msgRepo.MarkAsRead(ctx, convID, currentUserID)
}
