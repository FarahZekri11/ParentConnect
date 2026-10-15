package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// writeWait temps maximal d'attente pour l'écriture d'un message vers le client
	writeWait = 10 * time.Second

	// pongWait temps maximal d'attente d'une réponse pong du client avant déconnexion
	pongWait = 60 * time.Second

	// pingPeriod fréquence d'envoi des trames ping (doit être inférieur à pongWait)
	pingPeriod = (pongWait * 9) / 10

	// maxMessageSize taille maximale autorisée d'une trame entrante (8 Ko pour éviter DoS)
	maxMessageSize = 8192
)

// Client représente une connexion WebSocket active d'un utilisateur
type Client struct {
	Hub    *Hub
	Conn   *websocket.Conn
	Send   chan []byte
	UserID string
}

// ReadPump pompe les messages entrants depuis la socket WebSocket vers le Hub.
// Elle gère aussi le timeout pong pour détecter les déconnexions réseau abruptes.
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] Erreur inattendue fermeture client %s: %v", c.UserID, err)
			}
			break
		}

		var inbound InboundMessage
		if err := json.Unmarshal(message, &inbound); err != nil {
			c.SendError("Format JSON de message invalide")
			continue
		}

		c.Hub.HandleInbound(c, inbound)
	}
}

// WritePump pompe les messages sortants depuis le canal Send vers la socket WebSocket.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Le Hub a fermé le canal
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			// Vider la file de messages s'il y en a d'autres en attente
			n := len(c.Send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// SendError helper pour renvoyer une erreur formatée au client
func (c *Client) SendError(errMsg string) {
	out := OutboundMessage{
		Type:      EventError,
		Payload:   map[string]string{"error": errMsg},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	bytes, _ := json.Marshal(out)
	select {
	case c.Send <- bytes:
	default:
	}
}
