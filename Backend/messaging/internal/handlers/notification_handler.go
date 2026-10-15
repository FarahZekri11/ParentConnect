package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/services"
)

// NotificationHandler gère les requêtes HTTP de notifications
type NotificationHandler struct {
	service services.NotificationService
}

// NewNotificationHandler instancie le handler de notifications
func NewNotificationHandler(service services.NotificationService) *NotificationHandler {
	return &NotificationHandler{service: service}
}

// ListNotifications godoc
// @Summary      Lister les notifications
// @Description  Retourne les notifications de l'utilisateur connecté avec pagination et filtre optionnel non-lu.
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Param        page         query int  false "Numéro de page (défaut: 1)"
// @Param        limit        query int  false "Nombre d'éléments (défaut: 20)"
// @Param        unread_only  query bool false "Filtrer uniquement les non lues"
// @Success      200  {object}  models.StandardResponse{data=models.NotificationListResponse}
// @Failure      401  {object}  models.StandardResponse
// @Failure      500  {object}  models.StandardResponse
// @Router       /api/notifications [get]
func (h *NotificationHandler) ListNotifications(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié"})
		return
	}

	page, _ := strconv.ParseInt(c.DefaultQuery("page", "1"), 10, 64)
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)
	unreadOnly, _ := strconv.ParseBool(c.DefaultQuery("unread_only", "false"))

	res, err := h.service.ListNotifications(c.Request.Context(), userID, page, limit, unreadOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: res})
}

// GetUnreadCount godoc
// @Summary      Compteur de notifications non lues
// @Description  Retourne le nombre total de notifications non lues pour l'affichage du badge d'alerte.
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.StandardResponse{data=models.UnreadCountResponse}
// @Failure      401  {object}  models.StandardResponse
// @Failure      500  {object}  models.StandardResponse
// @Router       /api/notifications/unread-count [get]
func (h *NotificationHandler) GetUnreadCount(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié"})
		return
	}

	count, err := h.service.GetUnreadCount(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: models.UnreadCountResponse{UnreadCount: count}})
}

// MarkAsRead godoc
// @Summary      Marquer une notification comme lue
// @Description  Passe l'état d'une notification à lu (read=true).
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Param        id   path  string true "ID de la notification"
// @Success      200  {object}  models.StandardResponse
// @Failure      400  {object}  models.StandardResponse
// @Failure      401  {object}  models.StandardResponse
// @Failure      500  {object}  models.StandardResponse
// @Router       /api/notifications/{id}/read [patch]
func (h *NotificationHandler) MarkAsRead(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié"})
		return
	}

	notifID := c.Param("id")
	if err := h.service.MarkAsRead(c.Request.Context(), userID, notifID); err != nil {
		if errors.Is(err, services.ErrInvalidID) {
			c.JSON(http.StatusBadRequest, models.StandardResponse{Success: false, Error: "ID invalide"})
			return
		}
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: "Notification marquée comme lue"})
}

// MarkAllAsRead godoc
// @Summary      Marquer toutes les notifications comme lues
// @Description  Passe l'ensemble des notifications de l'utilisateur connecté à l'état lu.
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.StandardResponse
// @Failure      401  {object}  models.StandardResponse
// @Failure      500  {object}  models.StandardResponse
// @Router       /api/notifications/read-all [patch]
func (h *NotificationHandler) MarkAllAsRead(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, models.StandardResponse{Success: false, Error: "Non authentifié"})
		return
	}

	if err := h.service.MarkAllAsRead(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, models.StandardResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: "Toutes les notifications ont été marquées comme lues"})
}
