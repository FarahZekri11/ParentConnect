package integration

import (
	"context"
	"testing"
	"time"

	"github.com/parentconnect/messaging-service/internal/database"
	"github.com/parentconnect/messaging-service/internal/events"
	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcMongo "github.com/testcontainers/testcontainers-go/modules/mongodb"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func setupTestMongoDB(t *testing.T) (*mongo.Client, *mongo.Database, func()) {
	ctx := context.Background()

	// Démarrage d'un conteneur éphémère MongoDB 7.0
	mongoContainer, err := tcMongo.RunContainer(ctx, testcontainers.WithImage("mongo:7.0"))
	if err != nil {
		t.Skipf("Docker n'est pas disponible pour Testcontainers: %v", err)
	}

	endpoint, err := mongoContainer.ConnectionString(ctx)
	require.NoError(t, err)

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(endpoint))
	require.NoError(t, err)

	db := client.Database("messaging_test_db")

	cleanup := func() {
		_ = client.Disconnect(ctx)
		_ = mongoContainer.Terminate(ctx)
	}

	return client, db, cleanup
}

func TestMongoDB_IndexesAndIdempotence(t *testing.T) {
	_, db, cleanup := setupTestMongoDB(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	mongoWrapper := &database.MongoDB{Database: db}

	t.Run("Création et vérification des index", func(t *testing.T) {
		err := mongoWrapper.EnsureIndexes(ctx)
		require.NoError(t, err)

		// Vérification que les index existent bien sur la collection "conversations"
		cursor, err := db.Collection("conversations").Indexes().List(ctx)
		require.NoError(t, err)

		var indexes []bson.M
		err = cursor.All(ctx, &indexes)
		require.NoError(t, err)

		indexNames := make(map[string]bool)
		for _, idx := range indexes {
			if name, ok := idx["name"].(string); ok {
				indexNames[name] = true
			}
		}

		assert.True(t, indexNames["idx_conversations_participants"])
		assert.True(t, indexNames["idx_conversations_participants_updated_at"])
	})

	t.Run("Test d'idempotence des événements RabbitMQ (processed_events)", func(t *testing.T) {
		checker := events.NewIdempotenceChecker(db)
		eventID := "evt-unique-booking-12345"

		// Premier traitement : doit renvoyer true (succès)
		isNew, err := checker.CheckAndMark(ctx, eventID, "BookingAccepted")
		require.NoError(t, err)
		assert.True(t, isNew, "Le premier passage doit être marqué comme nouveau")

		// Rejeu du même événement (doublon RabbitMQ) : doit renvoyer false sans erreur
		isNewAgain, errAgain := checker.CheckAndMark(ctx, eventID, "BookingAccepted")
		require.NoError(t, errAgain)
		assert.False(t, isNewAgain, "L'événement en doublon doit être détecté et ignoré")
	})

	t.Run("Recherche multikey sur les participants", func(t *testing.T) {
		convCollection := db.Collection("conversations")
		conv := models.Conversation{
			Type:         models.ConversationTypeDirect,
			Participants: []string{"user-alice", "user-bob"},
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		_, err := convCollection.InsertOne(ctx, conv)
		require.NoError(t, err)

		// Trouver la conversation via un seul participant dans le tableau
		var found models.Conversation
		err = convCollection.FindOne(ctx, bson.M{"participants": "user-alice"}).Decode(&found)
		require.NoError(t, err)
		assert.Contains(t, found.Participants, "user-bob")
	})
}
