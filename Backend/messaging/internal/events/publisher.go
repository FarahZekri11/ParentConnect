package events

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/parentconnect/messaging-service/internal/models"
	amqp "github.com/rabbitmq/amqp091-go"
)

// EventPublisher interface pour émettre des événements sur RabbitMQ
type EventPublisher interface {
	PublishMessageSent(ctx context.Context, msg *models.Message) error
}

type rabbitPublisher struct {
	client *RabbitClient
}

// NewEventPublisher instancie le publisher d'événements
func NewEventPublisher(client *RabbitClient) EventPublisher {
	return &rabbitPublisher{client: client}
}

// PublishMessageSent publie l'événement d'envoi de message pour les autres services qui le souhaitent
func (p *rabbitPublisher) PublishMessageSent(ctx context.Context, msg *models.Message) error {
	ch := p.client.Channel()
	if ch == nil {
		return fmt.Errorf("canal RabbitMQ non disponible")
	}

	envelope := models.EventEnvelope{
		EventID:    uuid.New().String(),
		Type:       "MessageSent",
		Version:    "1.0",
		OccurredAt: time.Now().UTC(),
		Data: map[string]interface{}{
			"message_id":      msg.ID.Hex(),
			"conversation_id": msg.ConversationID.Hex(),
			"sender_id":       msg.SenderID,
			"created_at":      msg.CreatedAt,
		},
	}

	body, err := json.Marshal(envelope)
	if err != nil {
		return err
	}

	return ch.PublishWithContext(
		ctx,
		EventsExchange,
		"messaging.message.sent",
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent, // Message persistant sur disque
			Timestamp:    envelope.OccurredAt,
			Body:         body,
		},
	)
}
