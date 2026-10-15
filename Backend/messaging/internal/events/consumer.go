package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/services"
	"github.com/parentconnect/messaging-service/internal/ws"
	amqp "github.com/rabbitmq/amqp091-go"
)

// EventConsumer consomme les événements des autres services et applique la logique métier
type EventConsumer struct {
	client       *RabbitClient
	idempotence  IdempotenceChecker
	msgService   services.MessagingService
	notifService services.NotificationService
	hub          *ws.Hub
}

// NewEventConsumer instancie le consommateur
func NewEventConsumer(
	client *RabbitClient,
	idempotence IdempotenceChecker,
	msgService services.MessagingService,
	notifService services.NotificationService,
	hub *ws.Hub,
) *EventConsumer {
	return &EventConsumer{
		client:       client,
		idempotence:  idempotence,
		msgService:   msgService,
		notifService: notifService,
		hub:          hub,
	}
}

// Start lance la boucle de consommation des messages AMQP
func (c *EventConsumer) Start(ctx context.Context) error {
	ch := c.client.Channel()
	if ch == nil {
		return fmt.Errorf("canal RabbitMQ non disponible")
	}

	// Fair dispatching (prefetch à 10 pour ne pas saturer l'instance)
	if err := ch.Qos(10, 0, false); err != nil {
		return fmt.Errorf("erreur configuration QoS: %w", err)
	}

	msgs, err := ch.ConsumeWithContext(
		ctx,
		EventsQueue,
		"messaging-service-consumer",
		false, // auto-ack = false : on contrôle manuellement l'acquittement
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,
	)
	if err != nil {
		return fmt.Errorf("erreur démarrage consommation: %w", err)
	}

	log.Printf("[INFO] Consommateur d'événements RabbitMQ en écoute sur '%s'", EventsQueue)

	for {
		select {
		case <-ctx.Done():
			return nil
		case d, ok := <-msgs:
			if !ok {
				log.Println("[INFO] Canal de consommation fermé.")
				return nil
			}
			c.processDelivery(ctx, d)
		}
	}
}

// processDelivery traite une livraison unitaire avec gestion d'ack/nack et d'idempotence
func (c *EventConsumer) processDelivery(ctx context.Context, d amqp.Delivery) {
	var envelope models.EventEnvelope
	if err := json.Unmarshal(d.Body, &envelope); err != nil {
		log.Printf("[ERROR] Message malformé reçu sur '%s', rejet vers DLQ: %v", d.RoutingKey, err)
		// Rejet sans réenfilement (requeue = false) -> redirigé vers messaging.dlq
		_ = d.Nack(false, false)
		return
	}

	// 1. Contrôle d'idempotence strict
	isNew, err := c.idempotence.CheckAndMark(ctx, envelope.EventID, envelope.Type)
	if err != nil {
		log.Printf("[ERROR] Erreur vérification idempotence event %s: %v", envelope.EventID, err)
		_ = d.Nack(false, true) // Erreur temporaire DB -> on réenfile
		return
	}

	if !isNew {
		log.Printf("[INFO] Événement dupliqué ignoré (idempotence): id=%s type=%s", envelope.EventID, envelope.Type)
		_ = d.Ack(false)
		return
	}

	// 2. Traitement métier selon le type d'événement
	handlerErr := c.handleEvent(ctx, envelope)
	if handlerErr != nil {
		log.Printf("[ERROR] Échec traitement métier event %s: %v. Envoi en DLQ.", envelope.EventID, handlerErr)
		_ = d.Nack(false, false)
		return
	}

	// 3. Acquittement positif
	_ = d.Ack(false)
}

// handleEvent route l'événement vers son handler métier
func (c *EventConsumer) handleEvent(ctx context.Context, env models.EventEnvelope) error {
	switch env.Type {
	case "BookingAccepted":
		return c.handleBookingAccepted(ctx, env)

	case "NewNeighborJoined":
		return c.handleNewNeighborJoined(ctx, env)

	case "MarketplaceItemRequested":
		return c.handleMarketplaceRequest(ctx, env)

	default:
		log.Printf("[INFO] Type d'événement ignoré ou non géré par Messaging: %s", env.Type)
		return nil
	}
}

// handleBookingAccepted : Babysitting -> Messaging
func (c *EventConsumer) handleBookingAccepted(ctx context.Context, env models.EventEnvelope) error {
	requesterID, _ := env.Data["requester_id"].(string)
	babysitterID, _ := env.Data["babysitter_id"].(string)
	bookingID, _ := env.Data["booking_id"].(string)

	if requesterID == "" || babysitterID == "" {
		return fmt.Errorf("données incomplètes pour BookingAccepted")
	}

	// 1. Ouvrir ou lier la conversation entre les deux parents
	convReq := &models.CreateConversationRequest{
		Type:         models.ConversationTypeBabysitting,
		Participants: []string{requesterID, babysitterID},
		Context: &models.ConversationContext{
			ReferenceID: bookingID,
			Title:       "Garde d'enfants acceptée",
		},
	}
	_, _, err := c.msgService.CreateConversation(ctx, requesterID, convReq)
	if err != nil {
		log.Printf("[WARN] Création conversation garde: %v", err)
	}

	// 2. Création de la notification pour le parent demandeur
	notif := &models.Notification{
		UserID:  requesterID,
		Type:    models.NotificationTypeBookingAccepted,
		Title:   "Garde acceptée !",
		Message: "Votre demande de babysitting a été validée. Vous pouvez désormais échanger directement.",
		Payload: map[string]interface{}{
			"booking_id":    bookingID,
			"babysitter_id": babysitterID,
		},
	}
	if err := c.notifService.CreateNotification(ctx, notif); err != nil {
		return err
	}

	// 3. Diffusion temps réel par WebSocket si le parent est en ligne
	if c.hub != nil {
		c.hub.BroadcastToUsers(ctx, []string{requesterID}, ws.OutboundMessage{
			Type:      ws.EventNotification,
			Payload:   notif,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}

	return nil
}

// handleNewNeighborJoined : Geo -> Messaging
func (c *EventConsumer) handleNewNeighborJoined(ctx context.Context, env models.EventEnvelope) error {
	newUserID, _ := env.Data["new_user_id"].(string)
	neighborhoodName, _ := env.Data["neighborhood_name"].(string)
	rawNeighbors, ok := env.Data["neighbor_ids"].([]interface{})
	if !ok {
		return nil
	}

	targetNeighbors := make([]string, 0, len(rawNeighbors))
	for _, n := range rawNeighbors {
		if nid, ok := n.(string); ok && nid != newUserID {
			targetNeighbors = append(targetNeighbors, nid)
		}
	}

	for _, nid := range targetNeighbors {
		notif := &models.Notification{
			UserID:  nid,
			Type:    models.NotificationTypeNewNeighborJoined,
			Title:   "Nouveau voisin !",
			Message: fmt.Sprintf("Un nouveau parent a rejoint le quartier %s.", neighborhoodName),
			Payload: map[string]interface{}{
				"new_user_id":       newUserID,
				"neighborhood_name": neighborhoodName,
			},
		}
		_ = c.notifService.CreateNotification(ctx, notif)
	}

	// Diffusion temps réel aux voisins connectés
	if c.hub != nil && len(targetNeighbors) > 0 {
		c.hub.BroadcastToUsers(ctx, targetNeighbors, ws.OutboundMessage{
			Type: ws.EventNotification,
			Payload: map[string]string{
				"message": fmt.Sprintf("Un nouveau parent a rejoint le quartier %s.", neighborhoodName),
			},
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}

	return nil
}

// handleMarketplaceRequest : Marketplace -> Messaging
func (c *EventConsumer) handleMarketplaceRequest(ctx context.Context, env models.EventEnvelope) error {
	ownerID, _ := env.Data["owner_id"].(string)
	requesterID, _ := env.Data["requester_id"].(string)
	itemTitle, _ := env.Data["item_title"].(string)

	if ownerID == "" {
		return nil
	}

	notif := &models.Notification{
		UserID:  ownerID,
		Type:    models.NotificationTypeMarketplaceRequest,
		Title:   "Demande d'emprunt d'objet",
		Message: fmt.Sprintf("Un parent souhaite emprunter votre matériel : %s", itemTitle),
		Payload: env.Data,
	}
	if err := c.notifService.CreateNotification(ctx, notif); err != nil {
		return err
	}

	if c.hub != nil {
		c.hub.BroadcastToUsers(ctx, []string{ownerID}, ws.OutboundMessage{
			Type:      ws.EventNotification,
			Payload:   notif,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}

	_ = requesterID
	return nil
}
