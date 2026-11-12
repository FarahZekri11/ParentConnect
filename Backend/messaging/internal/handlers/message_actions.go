package handlers

import (
	"errors"
	"html"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/parentconnect/messaging-service/internal/attachments"
	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/services"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MessageActionsHandler : pièces jointes, modification et suppression de messages, statistiques ADMIN.
//
//	POST   /api/messages/attachments          (multipart : conversation_id, file) -> {id, content_type, size}
//	GET    /api/messages/attachments/:id      image, participants de la conversation uniquement
//	PATCH  /api/messages/:id                  {content} — expéditeur uniquement
//	DELETE /api/messages/:id                  expéditeur uniquement (contenu et images effacés)
//	GET    /api/messages/admin/stats          ADMIN : compteurs (aucun contenu de conversation)
type MessageActionsHandler struct {
	messages      *mongo.Collection
	conversations *mongo.Collection
	store         *attachments.Store
	maxLength     int
}

// NewMessageActionsHandler instancie le handler
func NewMessageActionsHandler(db *mongo.Database, store *attachments.Store, maxLength int) *MessageActionsHandler {
	return &MessageActionsHandler{
		messages:      db.Collection("messages"),
		conversations: db.Collection("conversations"),
		store:         store,
		maxLength:     maxLength,
	}
}

func (h *MessageActionsHandler) isParticipant(c *gin.Context, convID primitive.ObjectID, userID string) bool {
	n, err := h.conversations.CountDocuments(c.Request.Context(), bson.M{"_id": convID, "participants": userID})
	return err == nil && n > 0
}

func fail(c *gin.Context, status int, msg string) {
	c.JSON(status, models.StandardResponse{Success: false, Error: msg})
}

// UploadAttachment téléverse une image pour une conversation dont l'utilisateur est participant
func (h *MessageActionsHandler) UploadAttachment(c *gin.Context) {
	userID := getUserID(c)
	if h.store == nil {
		fail(c, http.StatusServiceUnavailable, services.ErrAttachmentsDisabled.Error())
		return
	}
	convID, err := primitive.ObjectIDFromHex(c.PostForm("conversation_id"))
	if err != nil {
		fail(c, http.StatusBadRequest, "conversation_id invalide")
		return
	}
	if !h.isParticipant(c, convID, userID) {
		fail(c, http.StatusForbidden, services.ErrForbidden.Error())
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, attachments.MaxBytes+64*1024)
	fileHeader, err := c.FormFile("file")
	if err != nil {
		fail(c, http.StatusBadRequest, "Image manquante (champ « file ») ou trop volumineuse (5 Mo maximum)")
		return
	}
	if fileHeader.Size > attachments.MaxBytes {
		fail(c, http.StatusRequestEntityTooLarge, attachments.ErrTooLarge.Error())
		return
	}
	f, err := fileHeader.Open()
	if err != nil {
		fail(c, http.StatusBadRequest, "Lecture du fichier impossible")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, attachments.MaxBytes+1))
	if err != nil {
		fail(c, http.StatusBadRequest, "Lecture du fichier impossible")
		return
	}
	att, err := h.store.Save(c.Request.Context(), convID, userID, data)
	if err != nil {
		switch {
		case errors.Is(err, attachments.ErrTooLarge):
			fail(c, http.StatusRequestEntityTooLarge, err.Error())
		case errors.Is(err, attachments.ErrNotImage):
			fail(c, http.StatusBadRequest, err.Error())
		default:
			fail(c, http.StatusInternalServerError, "Enregistrement de l'image impossible")
		}
		return
	}
	c.JSON(http.StatusCreated, models.StandardResponse{Success: true, Data: att})
}

// GetAttachment renvoie une image aux seuls participants de la conversation
func (h *MessageActionsHandler) GetAttachment(c *gin.Context) {
	if h.store == nil {
		fail(c, http.StatusNotFound, attachments.ErrNotFound.Error())
		return
	}
	path, contentType, convID, err := h.store.Open(c.Request.Context(), c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, attachments.ErrNotFound.Error())
		return
	}
	if !h.isParticipant(c, convID, getUserID(c)) {
		fail(c, http.StatusForbidden, services.ErrForbidden.Error())
		return
	}
	c.Header("Content-Type", contentType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "private, max-age=3600")
	c.File(path)
}

func (h *MessageActionsHandler) ownMessage(c *gin.Context) (*models.Message, bool) {
	msgID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		fail(c, http.StatusBadRequest, services.ErrInvalidID.Error())
		return nil, false
	}
	var msg models.Message
	if err := h.messages.FindOne(c.Request.Context(), bson.M{"_id": msgID}).Decode(&msg); err != nil {
		fail(c, http.StatusNotFound, "Message introuvable")
		return nil, false
	}
	if msg.SenderID != getUserID(c) {
		fail(c, http.StatusForbidden, "Seul l'expéditeur peut modifier ou supprimer ce message")
		return nil, false
	}
	if msg.Deleted {
		fail(c, http.StatusGone, "Ce message a déjà été supprimé")
		return nil, false
	}
	return &msg, true
}

// refreshLastMessage met à jour l'aperçu de la conversation si le message modifié en est le dernier
func (h *MessageActionsHandler) refreshLastMessage(c *gin.Context, msg *models.Message) {
	_, _ = h.conversations.UpdateOne(c.Request.Context(),
		bson.M{"_id": msg.ConversationID, "last_message.message_id": msg.ID},
		bson.M{"$set": bson.M{"last_message.content": services.PreviewText(msg)}})
}

// EditMessage modifie le texte d'un message (expéditeur uniquement)
func (h *MessageActionsHandler) EditMessage(c *gin.Context) {
	var req models.EditMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "Le contenu du message ne peut pas être vide")
		return
	}
	msg, ok := h.ownMessage(c)
	if !ok {
		return
	}
	clean := html.EscapeString(strings.TrimSpace(req.Content))
	if clean == "" {
		fail(c, http.StatusBadRequest, services.ErrEmptyMessage.Error())
		return
	}
	if len(clean) > h.maxLength {
		fail(c, http.StatusBadRequest, services.ErrMessageTooLong.Error())
		return
	}
	now := time.Now().UTC()
	var updated models.Message
	err := h.messages.FindOneAndUpdate(c.Request.Context(), bson.M{"_id": msg.ID},
		bson.M{"$set": bson.M{"content": clean, "edited_at": now}},
		options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated)
	if err != nil {
		fail(c, http.StatusInternalServerError, "Modification impossible")
		return
	}
	h.refreshLastMessage(c, &updated)
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: updated})
}

// DeleteMessage supprime un message (expéditeur uniquement) : contenu et images effacés, trace conservée
func (h *MessageActionsHandler) DeleteMessage(c *gin.Context) {
	msg, ok := h.ownMessage(c)
	if !ok {
		return
	}
	now := time.Now().UTC()
	_, err := h.messages.UpdateOne(c.Request.Context(), bson.M{"_id": msg.ID},
		bson.M{"$set": bson.M{"deleted": true, "content": "", "edited_at": now}, "$unset": bson.M{"attachments": ""}})
	if err != nil {
		fail(c, http.StatusInternalServerError, "Suppression impossible")
		return
	}
	if h.store != nil {
		h.store.DeleteForMessage(c.Request.Context(), msg.ID)
	}
	msg.Deleted = true
	h.refreshLastMessage(c, msg)
	c.Status(http.StatusNoContent)
}

// AdminStats compteurs de la messagerie (ADMIN) — aucun contenu n'est exposé
func (h *MessageActionsHandler) AdminStats(c *gin.Context) {
	if role, _ := c.Get("user_role"); role != "ADMIN" {
		fail(c, http.StatusForbidden, "Statistiques réservées aux administrateurs")
		return
	}
	ctx := c.Request.Context()
	conversations, _ := h.conversations.CountDocuments(ctx, bson.M{})
	messages, _ := h.messages.CountDocuments(ctx, bson.M{"deleted": bson.M{"$ne": true}})
	since := time.Now().UTC().AddDate(0, 0, -7)
	lastWeek, _ := h.messages.CountDocuments(ctx, bson.M{"created_at": bson.M{"$gte": since}})
	byType := map[string]int64{}
	cursor, err := h.conversations.Aggregate(ctx, mongo.Pipeline{
		{{Key: "$group", Value: bson.M{"_id": "$type", "count": bson.M{"$sum": 1}}}},
	})
	if err == nil {
		defer cursor.Close(ctx)
		for cursor.Next(ctx) {
			var row struct {
				ID    string `bson:"_id"`
				Count int64  `bson:"count"`
			}
			if cursor.Decode(&row) == nil {
				byType[row.ID] = row.Count
			}
		}
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Data: gin.H{
		"conversations":         conversations,
		"conversations_by_type": byType,
		"messages":              messages,
		"messages_last_7_days":  lastWeek,
	}})
}
