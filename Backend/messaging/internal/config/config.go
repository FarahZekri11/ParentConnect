package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config regroupe l'ensemble des configurations du microservice Messaging.
type Config struct {
	Port             string
	AppEnv           string
	MongoURL         string
	MongoDBName      string
	RedisURL         string
	RabbitMQURL      string
	JWTAlgorithm     string // "RS256" ou "HS256"
	JWTPublicKey     string // Clé publique PEM si RS256
	JWTSecret        string // Clé secrète partagée si HS256
	InternalAPIKey   string
	MaxMessageLength int
	EurekaEnabled    bool
	EurekaServerURL  string
	ServiceName      string
	InstanceHost     string
}

// Load charge la configuration depuis le fichier .env (si présent) et l'environnement système.
func Load() *Config {
	// Chargement silencieux du fichier .env en local s'il existe
	if err := godotenv.Load(); err != nil {
		log.Println("[INFO] Aucun fichier .env trouvé ou ignoré, utilisation des variables d'environnement système.")
	}

	maxMsgLen, err := strconv.Atoi(getEnv("MAX_MESSAGE_LENGTH", "2000"))
	if err != nil {
		maxMsgLen = 2000
	}

	return &Config{
		Port:             getEnv("PORT", "8085"),
		AppEnv:           getEnv("APP_ENV", "development"),
		MongoURL:         getEnv("MONGO_URL", "mongodb://messaging-mongo:27017"),
		MongoDBName:      getEnv("MONGO_DB", "messaging_db"),
		RedisURL:         getEnv("REDIS_URL", "redis://redis:6379/0"),
		RabbitMQURL:      getEnv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/"),
		JWTAlgorithm:     getEnv("JWT_ALGORITHM", "HS256"),
		JWTPublicKey:     getEnv("JWT_PUBLIC_KEY", ""),
		JWTSecret:        getEnv("JWT_SECRET", "change-me-in-production-parentconnect-secret"),
		InternalAPIKey:   getEnv("INTERNAL_API_KEY", "internal-secret-key-parentconnect"),
		MaxMessageLength: maxMsgLen,
		EurekaEnabled:    getEnv("EUREKA_ENABLED", "true") == "true",
		EurekaServerURL:  getEnv("EUREKA_SERVER_URL", "http://localhost:8761/eureka"),
		ServiceName:      getEnv("SERVICE_NAME", "MESSAGING-SERVICE"),
		InstanceHost:     getEnv("INSTANCE_HOST", "localhost"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
