package services

import (
	"context"

	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/repository"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// NotificationService interface métier pour les notifications
type NotificationService interface {
	ListNotifications(ctx context.Context, currentUserID string, page, limit int64, unreadOnly bool) (*models.NotificationListResponse, error)
	GetUnreadCount(ctx context.Context, currentUserID string) (int64, error)
	MarkAsRead(ctx context.Context, currentUserID, notifIDStr string) error
	MarkAllAsRead(ctx context.Context, currentUserID string) error
	CreateNotification(ctx context.Context, notif *models.Notification) error
}

type notificationService struct {
	notifRepo repository.NotificationRepository
}

// NewNotificationService instancie le service métier des notifications
func NewNotificationService(notifRepo repository.NotificationRepository) NotificationService {
	return &notificationService{
		notifRepo: notifRepo,
	}
}

func (s *notificationService) ListNotifications(ctx context.Context, currentUserID string, page, limit int64, unreadOnly bool) (*models.NotificationListResponse, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	skip := (page - 1) * limit

	notifs, total, err := s.notifRepo.ListByUser(ctx, currentUserID, limit, skip, unreadOnly)
	if err != nil {
		return nil, err
	}

	unreadCount, err := s.notifRepo.CountUnread(ctx, currentUserID)
	if err != nil {
		unreadCount = 0
	}

	return &models.NotificationListResponse{
		Notifications: notifs,
		Total:         total,
		UnreadCount:   unreadCount,
	}, nil
}

func (s *notificationService) GetUnreadCount(ctx context.Context, currentUserID string) (int64, error) {
	return s.notifRepo.CountUnread(ctx, currentUserID)
}

func (s *notificationService) MarkAsRead(ctx context.Context, currentUserID, notifIDStr string) error {
	notifID, err := primitive.ObjectIDFromHex(notifIDStr)
	if err != nil {
		return ErrInvalidID
	}
	return s.notifRepo.MarkAsRead(ctx, notifID, currentUserID)
}

func (s *notificationService) MarkAllAsRead(ctx context.Context, currentUserID string) error {
	return s.notifRepo.MarkAllAsRead(ctx, currentUserID)
}

func (s *notificationService) CreateNotification(ctx context.Context, notif *models.Notification) error {
	return s.notifRepo.Create(ctx, notif)
}
