package events

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	EventsExchange = "parentconnect.events"
	EventsQueue    = "messaging.events"
	DLXExchange    = "parentconnect.dlx"
	DLQQueue       = "messaging.dlq"
)

// RabbitClient gère la connexion, le cycle de vie et la topologie RabbitMQ
type RabbitClient struct {
	url        string
	conn       *amqp.Connection
	channel    *amqp.Channel
	mutex      sync.RWMutex
	isClosed   bool
	notifyConn chan *amqp.Error
}

// NewRabbitClient instancie le client RabbitMQ
func NewRabbitClient(url string) *RabbitClient {
	return &RabbitClient{
		url: url,
	}
}

// Connect tente une connexion avec initialisation de la topologie
func (c *RabbitClient) Connect() error {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	conn, err := amqp.Dial(c.url)
	if err != nil {
		return fmt.Errorf("connexion AMQP échouée: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("création de canal AMQP échouée: %w", err)
	}

	c.conn = conn
	c.channel = ch
	c.notifyConn = make(chan *amqp.Error)
	c.conn.NotifyClose(c.notifyConn)

	if err := c.setupTopology(); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return fmt.Errorf("erreur setup topologie RabbitMQ: %w", err)
	}

	log.Printf("[INFO] Connecté à RabbitMQ et topologie configurée avec succès")
	return nil
}

// setupTopology déclare l'exchange topic, les queues et la Dead Letter Queue (DLQ)
func (c *RabbitClient) setupTopology() error {
	// 1. Déclaration de la Dead Letter Exchange (DLX)
	if err := c.channel.ExchangeDeclare(
		DLXExchange,
		"direct",
		true,  // durable
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,
	); err != nil {
		return fmt.Errorf("échec déclaration DLX: %w", err)
	}

	// 2. Déclaration de la Dead Letter Queue (DLQ)
	if _, err := c.channel.QueueDeclare(
		DLQQueue,
		true,  // durable
		false, // auto-deleted
		false, // exclusive
		false, // no-wait
		nil,
	); err != nil {
		return fmt.Errorf("échec déclaration DLQ: %w", err)
	}

	// Binding DLQ sur DLX
	if err := c.channel.QueueBind(
		DLQQueue,
		DLQQueue,
		DLXExchange,
		false,
		nil,
	); err != nil {
		return fmt.Errorf("échec binding DLQ: %w", err)
	}

	// 3. Déclaration du topic exchange principal de ParentConnect
	if err := c.channel.ExchangeDeclare(
		EventsExchange,
		"topic",
		true,  // durable
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,
	); err != nil {
		return fmt.Errorf("échec déclaration exchange principal: %w", err)
	}

	// 4. Déclaration de la file dédiée au service Messaging avec redirection vers DLQ en cas de rejet
	queueArgs := amqp.Table{
		"x-dead-letter-exchange":    DLXExchange,
		"x-dead-letter-routing-key": DLQQueue,
	}

	if _, err := c.channel.QueueDeclare(
		EventsQueue,
		true,  // durable
		false, // auto-deleted
		false, // exclusive
		false, // no-wait
		queueArgs,
	); err != nil {
		return fmt.Errorf("échec déclaration queue messaging: %w", err)
	}

	// 5. Liaisons (Bindings) aux routing keys d'intérêt pour la messagerie
	routingKeys := []string{
		"babysitting.booking.accepted",
		"geo.neighbor.joined",
		"marketplace.item.requested",
		"events.participant.registered",
	}

	for _, rk := range routingKeys {
		if err := c.channel.QueueBind(
			EventsQueue,
			rk,
			EventsExchange,
			false,
			nil,
		); err != nil {
			return fmt.Errorf("échec binding routing key %s: %w", rk, err)
		}
	}

	log.Printf("[INFO] Queue '%s' liée à %d patterns d'événements", EventsQueue, len(routingKeys))
	return nil
}

// Channel retourne le channel AMQP actif
func (c *RabbitClient) Channel() *amqp.Channel {
	c.mutex.RLock()
	defer c.mutex.RUnlock()
	return c.channel
}

// Close ferme proprement le canal et la connexion
func (c *RabbitClient) Close() {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.isClosed = true
	if c.channel != nil {
		_ = c.channel.Close()
	}
	if c.conn != nil {
		_ = c.conn.Close()
	}
	log.Println("[INFO] Connexion RabbitMQ fermée.")
}

// ReconnectLoop gère la reconnexion automatique en cas de coupure réseau
func (c *RabbitClient) ReconnectLoop(ctx context.Context, onReconnect func()) {
	for {
		select {
		case <-ctx.Done():
			return
		case err, ok := <-c.notifyConn:
			if !ok || c.isClosed {
				return
			}
			log.Printf("[WARN] Déconnexion RabbitMQ détectée: %v. Tentative de reconnexion dans 5s...", err)
			time.Sleep(5 * time.Second)

			for {
				select {
				case <-ctx.Done():
					return
				default:
					if err := c.Connect(); err != nil {
						log.Printf("[WARN] Reconnexion RabbitMQ échouée: %v. Nouvelle tentative dans 5s...", err)
						time.Sleep(5 * time.Second)
						continue
					}
					log.Println("[INFO] Reconnexion RabbitMQ réussie !")
					if onReconnect != nil {
						go onReconnect()
					}
					return
				}
			}
		}
	}
}
