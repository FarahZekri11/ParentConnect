package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

// MongoDB encapsule le client et la base de données MongoDB
type MongoDB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

// ConnectMongo initialise la connexion à MongoDB avec un timeout de précaution
func ConnectMongo(uri, dbName string) (*MongoDB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOptions := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, fmt.Errorf("impossible de se connecter à MongoDB: %w", err)
	}

	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		return nil, fmt.Errorf("ping MongoDB échoué: %w", err)
	}

	log.Printf("[INFO] Connecté à MongoDB sur la base: %s", dbName)
	return &MongoDB{
		Client:   client,
		Database: client.Database(dbName),
	}, nil
}

// Ping vérifie la disponibilité de MongoDB
func (m *MongoDB) Ping(ctx context.Context) error {
	if m == nil || m.Client == nil {
		return fmt.Errorf("client MongoDB non initialisé")
	}
	return m.Client.Ping(ctx, readpref.Primary())
}

// Close libère les connexions du pool MongoDB
func (m *MongoDB) Close() error {
	if m == nil || m.Client == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return m.Client.Disconnect(ctx)
}
