// Package attachments gère les images jointes aux messages : validation, stockage sur volume persistant
// et contrôle d'accès (seuls les participants de la conversation peuvent les lire).
package attachments

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/parentconnect/messaging-service/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// MaxBytes taille maximale d'une image jointe (5 Mo)
const MaxBytes = 5 * 1024 * 1024

var (
	ErrNotImage     = errors.New("fichier refusé : seules les images JPEG, PNG, WebP ou GIF sont acceptées")
	ErrTooLarge     = errors.New("image trop volumineuse (5 Mo maximum)")
	ErrNotFound     = errors.New("pièce jointe introuvable")
	ErrNotUsable    = errors.New("pièce jointe invalide pour ce message")
	storedNameRegex = regexp.MustCompile(`^[0-9a-f]{32}\.(jpg|png|webp|gif)$`)
	extByType       = map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
)

// record document de la collection "attachments"
type record struct {
	ID             string              `bson:"_id"`
	ConversationID primitive.ObjectID  `bson:"conversation_id"`
	UploaderID     string              `bson:"uploader_id"`
	ContentType    string              `bson:"content_type"`
	Size           int64               `bson:"size"`
	MessageID      *primitive.ObjectID `bson:"message_id,omitempty"`
	CreatedAt      time.Time           `bson:"created_at"`
}

// Store stockage des pièces jointes
type Store struct {
	collection *mongo.Collection
	dir        string
}

// NewStore crée le stockage ; dir est le dossier persistant (volume Docker)
func NewStore(db *mongo.Database, dir string) (*Store, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o750); err != nil {
		return nil, fmt.Errorf("création du dossier des pièces jointes: %w", err)
	}
	return &Store{collection: db.Collection("attachments"), dir: abs}, nil
}

// DetectImageType renvoie le type MIME réel (d'après les premiers octets) s'il s'agit d'une image autorisée
func DetectImageType(data []byte) (string, bool) {
	ct := http.DetectContentType(data)
	_, ok := extByType[ct]
	return ct, ok
}

func randomName(ext string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x.%s", b, ext), nil
}

// Save valide et enregistre une image pour une conversation (l'appelant a vérifié l'appartenance)
func (s *Store) Save(ctx context.Context, convID primitive.ObjectID, uploaderID string, data []byte) (*models.Attachment, error) {
	if len(data) > MaxBytes {
		return nil, ErrTooLarge
	}
	ct, ok := DetectImageType(data)
	if !ok {
		return nil, ErrNotImage
	}
	name, err := randomName(extByType[ct])
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(s.dir, name), data, 0o640); err != nil {
		return nil, fmt.Errorf("écriture de la pièce jointe: %w", err)
	}
	rec := record{
		ID: name, ConversationID: convID, UploaderID: uploaderID,
		ContentType: ct, Size: int64(len(data)), CreatedAt: time.Now().UTC(),
	}
	if _, err := s.collection.InsertOne(ctx, rec); err != nil {
		_ = os.Remove(filepath.Join(s.dir, name))
		return nil, err
	}
	return &models.Attachment{ID: name, ContentType: ct, Size: rec.Size}, nil
}

// Claim rattache des pièces jointes à un message : elles doivent appartenir à la même conversation,
// avoir été téléversées par l'expéditeur et ne pas être déjà utilisées.
func (s *Store) Claim(ctx context.Context, ids []string, convID primitive.ObjectID, uploaderID string, messageID primitive.ObjectID) ([]models.Attachment, error) {
	out := make([]models.Attachment, 0, len(ids))
	for _, id := range ids {
		if !storedNameRegex.MatchString(id) {
			return nil, ErrNotUsable
		}
		var rec record
		err := s.collection.FindOneAndUpdate(ctx,
			bson.M{"_id": id, "conversation_id": convID, "uploader_id": uploaderID, "message_id": bson.M{"$exists": false}},
			bson.M{"$set": bson.M{"message_id": messageID}},
		).Decode(&rec)
		if err != nil {
			return nil, ErrNotUsable
		}
		out = append(out, models.Attachment{ID: rec.ID, ContentType: rec.ContentType, Size: rec.Size})
	}
	return out, nil
}

// Open renvoie le chemin et le type d'une pièce jointe ainsi que sa conversation (pour le contrôle d'accès)
func (s *Store) Open(ctx context.Context, id string) (path string, contentType string, convID primitive.ObjectID, err error) {
	if !storedNameRegex.MatchString(id) {
		return "", "", primitive.NilObjectID, ErrNotFound
	}
	var rec record
	if err := s.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&rec); err != nil {
		return "", "", primitive.NilObjectID, ErrNotFound
	}
	p := filepath.Join(s.dir, rec.ID)
	if filepath.Dir(p) != s.dir {
		return "", "", primitive.NilObjectID, ErrNotFound
	}
	return p, rec.ContentType, rec.ConversationID, nil
}

// DeleteForMessage efface les fichiers et enregistrements des pièces jointes d'un message supprimé
func (s *Store) DeleteForMessage(ctx context.Context, messageID primitive.ObjectID) {
	cursor, err := s.collection.Find(ctx, bson.M{"message_id": messageID})
	if err != nil {
		return
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var rec record
		if cursor.Decode(&rec) == nil && storedNameRegex.MatchString(rec.ID) {
			_ = os.Remove(filepath.Join(s.dir, rec.ID))
		}
	}
	_, _ = s.collection.DeleteMany(ctx, bson.M{"message_id": messageID})
}
