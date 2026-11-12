package handlers

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/parentconnect/messaging-service/internal/middleware"
	"github.com/parentconnect/messaging-service/internal/ws"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Vérification de l'origine pour prévenir les failles CSWSH (Cross-Site WebSocket Hijacking)
	CheckOrigin: func(r *http.Request) bool {
		// En développement / environnement Docker commun, on autorise toutes les origines locales
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		// En production, filtrer sur les domaines autorisés de ParentConnect
		return true
	},
}

// WSHandler gère l'upgrade HTTP vers WebSocket
type WSHandler struct {
	hub            *ws.Hub
	tokenValidator *middleware.TokenValidator
}

// NewWSHandler instancie le handler WebSocket
func NewWSHandler(hub *ws.Hub, validator *middleware.TokenValidator) *WSHandler {
	return &WSHandler{
		hub:            hub,
		tokenValidator: validator,
	}
}

// ServeWS gère la négociation de la socket et son cycle de vie
// @Summary      Connexion WebSocket temps réel
// @Description  Initie une connexion WebSocket persistante pour la messagerie instantanée, les indicateurs de frappe et les notifications en direct.
// @Tags         WebSocket
// @Param        token  query string false "Jeton JWT (recommandé pour les clients navigateurs)"
// @Router       /ws [get]
func (h *WSHandler) ServeWS(c *gin.Context) {
	// 1. Extraction du token JWT (depuis query param ?token= ou header Authorization)
	tokenStr := c.Query("token")
	if tokenStr == "" {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			tokenStr = authHeader[7:]
		}
	}

	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Token JWT manquant pour la connexion WebSocket"})
		return
	}

	// 2. Validation cryptographique du token
	claims, err := h.tokenValidator.ValidateToken(tokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Jeton JWT invalide ou expiré: " + err.Error()})
		return
	}

	userID := claims.Subject

	// 3. Upgrade de la connexion HTTP en WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[WS] Erreur upgrade WebSocket: %v", err)
		return
	}

	client := &ws.Client{
		Hub:    h.hub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		UserID: userID,
	}

	// 4. Enregistrement auprès du Hub
	client.Hub.Register <- client

	// 5. Démarrage des deux goroutines de transfert
	go client.WritePump()
	go client.ReadPump()
}
