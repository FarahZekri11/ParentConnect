package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// Redis encapsule le client Redis
type Redis struct {
	Client *redis.Client
}

// ConnectRedis initialise la connexion à Redis via son URL
func ConnectRedis(rawURL string) (*Redis, error) {
	opt, err := redis.ParseURL(rawURL)
	if err != nil {
		return nil, fmt.Errorf("URL Redis invalide (%s): %w", rawURL, err)
	}

	client := redis.NewClient(opt)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ping Redis échoué: %w", err)
	}

	log.Println("[INFO] Connecté à Redis avec succès")
	return &Redis{Client: client}, nil
}

// Ping vérifie la disponibilité de Redis
func (r *Redis) Ping(ctx context.Context) error {
	if r == nil || r.Client == nil {
		return fmt.Errorf("client Redis non initialisé")
	}
	return r.Client.Ping(ctx).Err()
}

// Close ferme la connexion Redis
func (r *Redis) Close() error {
	if r == nil || r.Client == nil {
		return nil
	}
	return r.Client.Close()
}
