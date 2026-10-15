package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/services"
)

// ConversationHandler gère les requêtes HTTP pour les conversations et messages
type ConversationHandler struct {
	service services.MessagingService
}

// NewConversationHandler instancie le handler
func NewConversationHandler(service services.MessagingService) *ConversationHandler {
	return &ConversationHandler{service: service}
}

// Helper pour extraire le user_id authentifié
func getUserID(c *gin.Context) string {
	if uid, exists := c.Get("user_id"); exists {
		if s, ok := uid.(string); ok && s != "" {
			return s
		}
	}
	// Fallback sur le header X-User-ID (propagé par API Gateway Nginx ou en dev)
	return c.GetHeader("X-User-ID")
}

// CreateConversation godoc
// @Summary      Créer une conversation
// @Description  Crée une nouvelle conversation directe ou liée à un contexte (garde, annonce, événement). Si une conversation directe existe déjà entre les participants, elle est renvoyée.
// @Tags         Conversations
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request body models.CreateConversationRequest true "Paramètres de la conversation"
// @Success      201  {object}  models.StandardResponse{data=models.Conversation} "Nouvelle conversation créée"
// @Success      200  {object}  models.StandardResponse{data=models.Conversation} "Conversation existante renvoyée"
// @Failure      400  {object}  models.StandardResponse
// @Failure      401  {object}  models.StandardResponse
// @Failure      500  {object}  models.StandardResponse
// @Router       /api/conversations [post]
func (h *ConversationHandler) CreateConversation(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié (user_id manquant)"})
		return
	}

	var req models.CreateConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	conv, isNew, err := h.service.CreateConversation(c.Request.Context(), userID, &req)
	if err != nil {
		if errors.Is(err, services.ErrSelfConversation) {
			c.JSON(http.StatusBadRequest, models.StandardResponse{Success: false, Error: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	status := http.StatusCreated
	if !isNew {
		status = http.StatusOK
	}

	c.JSON(status, models.StandardResponse{Success: true, Data: conv})
}

// ListConversations godoc
// @Summary      Lister mes conversations
// @Description  Retourne la liste paginée des conversations de l'utilisateur connecté avec le dernier message et le compteur de non lus.
// @Tags         Conversations
// @Produce      json
// @Security     BearerAuth
// @Param        page   query int false "Numéro de page (défaut: 1)"
// @Param        limit  query int false "Nombre d'éléments (défaut: 20)"
// @Success      200  {object}  models.StandardResponse{data=[]models.ConversationResponse}
// @Failure      401  {object}  models.StandardResponse
// @Failure      500  {object}  models.StandardResponse
// @Router       /api/conversations [get]
func (h *ConversationHandler) ListConversations(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié"})
		return
	}

	page, _ := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)

	res, err := h.service.ListConversations(c.Request.Context(), userID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: res})
}

// GetMessages godoc
// @Summary      Historique des messages d'une conversation
// @Description  Retourne les messages d'une conversation avec pagination par curseur (before_id) pour scrolling infini.
// @Tags         Conversations
// @Produce      json
// @Security     BearerAuth
// @Param        id        path  string  true  "ID de la conversation"
// @Param        limit     query int     false "Nombre de messages (défaut: 50)"
// @Param        before_id query string  false "ID du message avant lequel paginer (curseur)"
// @Success      200  {object}  models.StandardResponse{data=models.MessageHistoryResponse}
// @Failure      400  {object}  models.StandardResponse
// @Failure      401  {object}  models.StandardResponse
// @Failure      403  {object}  models.StandardResponse
// @Failure      500  {object}  models.StandardResponse
// @Router       /api/conversations/{id}/messages [get]
func (h *ConversationHandler) GetMessages(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié"})
		return
	}

	convID := c.Param("id")
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "50"), 10, 64)
	beforeID := c.Query("before_id")

	history, err := h.service.GetMessages(c.Request.Context(), userID, convID, limit, beforeID)
	if err != nil {
		if errors.Is(err, services.ErrInvalidID) {
			c.JSON(http.StatusBadRequest, models.StandardResponse{Success: false, Error: "ID de conversation invalide"})
			return
		}
		if errors.Is(err, services.ErrForbidden) {
			c.JSON(http.StatusForbidden, models.StandardResponse{Success: false, Error: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: history})
}

// SendMessage godoc
// @Summary      Envoyer un message
// @Description  Envoie un nouveau message dans une conversation dont l'utilisateur est participant.
// @Tags         Messages
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request body models.SendMessageRequest true "Corps du message"
// @Success      201  {object}  models.StandardResponse{data=models.Message}
// @Failure      400  {object}  models.StandardResponse
// @Failure      401  {object}  models.StandardResponse
// @Failure      403  {object}  models.StandardResponse
// @Failure      500  {object}  models.StandardResponse
// @Router       /api/messages [post]
func (h *ConversationHandler) SendMessage(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié"})
		return
	}

	var req models.SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	msg, err := h.service.SendMessage(c.Request.Context(), userID, &req)
	if err != nil {
		if errors.Is(err, services.ErrInvalidID) || errors.Is(err, services.ErrEmptyMessage) {
			c.JSON(http.StatusBadRequest, models.StandardResponse{Success: false, Error: err.Error()})
			return
		}
		if errors.Is(err, services.ErrMessageTooLong) {
			c.JSON(http.StatusBadRequest, models.StandardResponse{Success: false, Error: err.Error()})
			return
		}
		if errors.Is(err, services.ErrForbidden) {
			c.JSON(http.StatusForbidden, models.StandardResponse{Success: false, Error: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusCreated, models.StandardResponse{Success: true, Data: msg})
}

// MarkConversationAsRead godoc
// @Summary      Marquer une conversation comme lue
// @Description  Marque tous les messages non lus d'une conversation comme lus par l'utilisateur connecté.
// @Tags         Conversations
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "ID de la conversation"
// @Success      200 {object}  models.StandardResponse
// @Failure      400 {object}  models.StandardResponse
// @Failure      401 {object}  models.StandardResponse
// @Failure      403 {object}  models.StandardResponse
// @Failure      500 {object}  models.StandardResponse
// @Router       /api/conversations/{id}/read [patch]
func (h *ConversationHandler) MarkConversationAsRead(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié"})
		return
	}

	convID := c.Param("id")
	if err := h.service.MarkConversationAsRead(c.Request.Context(), userID, convID); err != nil {
		if errors.Is(err, services.ErrInvalidID) {
			c.JSON(http.StatusBadRequest, models.StandardResponse{Success: false, Error: "ID invalide"})
			return
		}
		if errors.Is(err, services.ErrForbidden) {
			c.JSON(http.StatusForbidden, models.StandardResponse{Success: false, Error: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: "Conversation marquée comme lue"})
}
