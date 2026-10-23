package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"go.uber.org/zap"

	_ "github.com/parentconnect/messaging-service/docs"
	"github.com/parentconnect/messaging-service/internal/config"
	"github.com/parentconnect/messaging-service/internal/database"
	"github.com/parentconnect/messaging-service/internal/discovery"
	"github.com/parentconnect/messaging-service/internal/events"
	"github.com/parentconnect/messaging-service/internal/handlers"
	"github.com/parentconnect/messaging-service/internal/middleware"
	"github.com/parentconnect/messaging-service/internal/repository"
	"github.com/parentconnect/messaging-service/internal/services"
	"github.com/parentconnect/messaging-service/internal/ws"
)

// @title           ParentConnect Messaging Service API
// @version         1.0
// @description     Microservice de messagerie instantanée, notifications et conversations pour la plateforme ParentConnect.
// @contact.name    Équipe Messaging - ParentConnect
// @license.name    Apache 2.0
// @host            localhost:8085
// @BasePath        /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Entrez le token JWT sous la forme: Bearer <votre_token>
func main() {
	// 1. Initialisation de la configuration
	cfg := config.Load()

	// 2. Initialisation du logger structuré (Zap JSON)
	var zapLogger *zap.Logger
	var err error
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
		zapLogger, err = zap.NewProduction()
	} else {
		gin.SetMode(gin.DebugMode)
		zapLogger, err = zap.NewDevelopment()
	}
	if err != nil {
		fmt.Printf("Erreur initialisation logger: %v\n", err)
		os.Exit(1)
	}
	defer zapLogger.Sync()

	zapLogger.Info("Démarrage du service Messaging",
		zap.String("service", "messaging"),
		zap.String("port", cfg.Port),
		zap.String("env", cfg.AppEnv),
	)

	// 3. Initialisation des connexions aux bases de données
	// Le service tente de se connecter, mais un échec ne bloque pas le démarrage du processus
	// afin de respecter les patterns de résilience microservices (vérifié via /ready).
	mongoDB, err := database.ConnectMongo(cfg.MongoURL, cfg.MongoDBName)
	if err != nil {
		zapLogger.Warn("Connexion initiale à MongoDB échouée (en attente de reconnexion)", zap.Error(err))
	} else {
		defer mongoDB.Close()
		initCtx, initCancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := mongoDB.EnsureIndexes(initCtx); err != nil {
			zapLogger.Warn("Impossible d'initialiser les index MongoDB", zap.Error(err))
		}
		initCancel()
	}

	redisClient, err := database.ConnectRedis(cfg.RedisURL)
	if err != nil {
		zapLogger.Warn("Connexion initiale à Redis échouée (en attente de reconnexion)", zap.Error(err))
	} else {
		defer redisClient.Close()
	}

	// 4. Initialisation du validateur JWT
	tokenValidator, err := middleware.NewTokenValidator(cfg)
	if err != nil {
		zapLogger.Fatal("Configuration JWT invalide", zap.Error(err))
	}

	// 5. Initialisation des repositories, services et du Hub WebSocket
	var convHandler *handlers.ConversationHandler
	var notifHandler *handlers.NotificationHandler
	var wsHandler *handlers.WSHandler

	serverCtx, serverCancel := context.WithCancel(context.Background())
	defer serverCancel()

	if mongoDB != nil && mongoDB.Database != nil {
		convRepo := repository.NewConversationRepository(mongoDB.Database)
		msgRepo := repository.NewMessageRepository(mongoDB.Database)
		notifRepo := repository.NewNotificationRepository(mongoDB.Database)

		messagingService := services.NewMessagingService(convRepo, msgRepo, cfg.MaxMessageLength)
		notificationService := services.NewNotificationService(notifRepo)

		convHandler = handlers.NewConversationHandler(messagingService)
		notifHandler = handlers.NewNotificationHandler(notificationService)

		// Initialisation du Hub WebSocket
		hub := ws.NewHub(messagingService, notificationService)
		if redisClient != nil {
			redisPubSub := ws.NewRedisPubSub(redisClient, hub)
			hub.SetPubSub(redisPubSub)
			go redisPubSub.StartSubscription(serverCtx)
		}
		go hub.Run(serverCtx)

		wsHandler = handlers.NewWSHandler(hub, tokenValidator)

		// Initialisation du bus d'événements RabbitMQ
		rabbitClient := events.NewRabbitClient(cfg.RabbitMQURL)
		go func() {
			if err := rabbitClient.Connect(); err != nil {
				zapLogger.Warn("Connexion initiale à RabbitMQ différée", zap.Error(err))
			} else {
				idempotenceChecker := events.NewIdempotenceChecker(mongoDB.Database)
				consumer := events.NewEventConsumer(rabbitClient, idempotenceChecker, messagingService, notificationService, hub)
				go func() {
					if err := consumer.Start(serverCtx); err != nil {
						zapLogger.Error("Erreur dans le consommateur RabbitMQ", zap.Error(err))
					}
				}()
				go rabbitClient.ReconnectLoop(serverCtx, func() {
					_ = consumer.Start(serverCtx)
				})
			}
		}()
	}

	// 5.bis Enregistrement et découverte auprès de Spring Cloud Eureka Discovery
	if cfg.EurekaEnabled {
		eurekaClient := discovery.NewEurekaClient(cfg.EurekaServerURL, cfg.ServiceName, cfg.InstanceHost, cfg.Port, zapLogger)
		go eurekaClient.StartLifeCycle(serverCtx)
	}

	// 6. Initialisation du routeur Gin avec middlewares de sécurité et résilience
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware())
	router.Use(middleware.SecurityHeadersMiddleware())
	router.Use(middleware.MaxBodySizeMiddleware(1 << 20)) // 1 Mo max
	router.Use(middleware.RequestIDMiddleware())
	router.Use(middleware.StructuredLoggerMiddleware(zapLogger))

	// Initialisation des limiteurs de débit (Rate Limiting)
	globalRateLimiter := middleware.NewRateLimiter(redisClient, 120, 1*time.Minute) // 120 req/min
	messageRateLimiter := middleware.NewRateLimiter(redisClient, 20, 1*time.Minute)  // 20 messages/min max

	router.Use(globalRateLimiter.LimitByIP())

	// 7. Enregistrement des routes de supervision et documentation (publiques)
	healthHandler := handlers.NewHealthHandler(mongoDB, redisClient)
	router.GET("/health", healthHandler.HealthCheck)
	router.GET("/ready", healthHandler.ReadinessCheck)
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// 8. Endpoint WebSocket temps réel
	router.GET("/ws", func(c *gin.Context) {
		if wsHandler == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Service WebSocket indisponible (base de données non prête)"})
			return
		}
		wsHandler.ServeWS(c)
	})

	// 9. Enregistrement des routes API REST
	api := router.Group("/api")
	{
		api.GET("/ping", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "pong"})
		})

		// Middleware vérifiant que la base de données est initialisée
		dbGuard := func(c *gin.Context) {
			if convHandler == nil || notifHandler == nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"success": false,
					"error":   "La base de données n'est pas encore prête. Réessayez dans un instant.",
				})
				c.Abort()
				return
			}
			c.Next()
		}

		// Groupe protégé par le JWT d'Identity
		authRequired := api.Group("", middleware.AuthMiddleware(tokenValidator), dbGuard)
		{
			// Routes Conversations
			authRequired.POST("/conversations", func(c *gin.Context) { convHandler.CreateConversation(c) })
			authRequired.GET("/conversations", func(c *gin.Context) { convHandler.ListConversations(c) })
			authRequired.GET("/conversations/:id/messages", func(c *gin.Context) { convHandler.GetMessages(c) })
			authRequired.PATCH("/conversations/:id/read", func(c *gin.Context) { convHandler.MarkConversationAsRead(c) })

			// Routes Messages avec protection anti-spam (20 messages/min)
			authRequired.POST("/messages", messageRateLimiter.LimitByUser(), func(c *gin.Context) { convHandler.SendMessage(c) })

			// Routes Notifications
			authRequired.GET("/notifications", func(c *gin.Context) { notifHandler.ListNotifications(c) })
			authRequired.GET("/notifications/unread-count", func(c *gin.Context) { notifHandler.GetUnreadCount(c) })
			authRequired.PATCH("/notifications/:id/read", func(c *gin.Context) { notifHandler.MarkAsRead(c) })
			authRequired.PATCH("/notifications/read-all", func(c *gin.Context) { notifHandler.MarkAllAsRead(c) })
		}
	}

	// 10. Routes internes inter-microservices protégées par X-Internal-Key
	internalGroup := router.Group("/internal", middleware.InternalAuthMiddleware(cfg.InternalAPIKey))
	{
		internalGroup.GET("/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "internal_ok"})
		})
	}

	// 6. Serveur HTTP avec Graceful Shutdown
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		zapLogger.Info("Serveur HTTP en écoute", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			zapLogger.Fatal("Erreur critique sur le serveur HTTP", zap.Error(err))
		}
	}()

	// Interception des signaux système d'arrêt
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	zapLogger.Info("Signal de terminaison reçu, arrêt gracieux en cours...", zap.String("signal", sig.String()))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		zapLogger.Error("Arrêt forcé du serveur HTTP suite à timeout", zap.Error(err))
	}

	zapLogger.Info("Service Messaging arrêté proprement.")
}
