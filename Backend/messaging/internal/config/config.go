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
	JWTPublicKey     string // Clé publique PEM si RS256 (contenu PEM ou chemin fichier)
	JWTSecret        string // Clé secrète partagée si HS256
	// KeycloakRealmPublicKey est la clé publique RSA du Realm Keycloak 'parentconnect'
	// au format PEM brut. Prend le dessus sur JWTPublicKey si les deux sont définis.
	// Variable d'environnement : KEYCLOAK_REALM_PUBLIC_KEY
	KeycloakRealmPublicKey string
	InternalAPIKey         string
	MaxMessageLength       int
	EurekaEnabled          bool
	EurekaServerURL        string
	ServiceName            string
	InstanceHost           string
	// TrustedProxiesEnabled active la vérification que les requêtes proviennent
	// bien d'une Gateway de confiance (via le header X-Forwarded-For).
	// À activer en production derrière Nginx ou Spring Cloud Gateway.
	TrustedProxiesEnabled bool
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

	// KEYCLOAK_REALM_PUBLIC_KEY a priorité sur JWT_PUBLIC_KEY pour l'intégration Keycloak RS256
	keycloakKey := getEnv("KEYCLOAK_REALM_PUBLIC_KEY", "")
	jwtPublicKey := getEnv("JWT_PUBLIC_KEY", "")
	if keycloakKey != "" {
		jwtPublicKey = keycloakKey
	}

	return &Config{
		Port:                   getEnv("PORT", getEnv("APP_PORT", "8080")),
		AppEnv:                 getEnv("APP_ENV", "development"),
		MongoURL:               getEnv("MONGO_URL", "mongodb://messaging-mongo:27017"),
		MongoDBName:            getEnv("MONGO_DB", "messaging_db"),
		RedisURL:               getEnv("REDIS_URL", "redis://redis:6379/0"),
		RabbitMQURL:            getEnv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/"),
		JWTAlgorithm:           getEnv("JWT_ALGORITHM", "RS256"),
		JWTPublicKey:           jwtPublicKey,
		JWTSecret:              getEnv("JWT_SECRET", ""),
		KeycloakRealmPublicKey: keycloakKey,
		InternalAPIKey:         getEnv("INTERNAL_API_KEY", "internal-secret-key-parentconnect"),
		MaxMessageLength:       maxMsgLen,
		EurekaEnabled:          getEnv("EUREKA_ENABLED", "true") == "true",
		EurekaServerURL:        getEnv("EUREKA_SERVER_URL", "http://eureka-server:8761/eureka/"),
		ServiceName:            getEnv("SERVICE_NAME", "PARENTCONNECT-MESSAGING"),
		InstanceHost:           getEnv("INSTANCE_HOST", "messaging-service"),
		TrustedProxiesEnabled:  getEnv("TRUSTED_PROXIES_ENABLED", "false") == "true",
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
