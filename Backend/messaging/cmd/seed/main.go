package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/parentconnect/messaging-service/internal/config"
	"github.com/parentconnect/messaging-service/internal/database"
	"github.com/parentconnect/messaging-service/internal/middleware"
	"github.com/parentconnect/messaging-service/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func main() {
	fmt.Println("==========================================================")
	fmt.Println(" 🌱 ParentConnect Messaging - Script de Démonstration/Seed")
	fmt.Println("==========================================================")

	cfg := config.Load()
	mongoDB, err := database.ConnectMongo(cfg.MongoURL, cfg.MongoDBName)
	if err != nil {
		log.Fatalf("Impossible de se connecter à MongoDB: %v", err)
	}
	defer mongoDB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Initialisation des index
	if err := mongoDB.EnsureIndexes(ctx); err != nil {
		log.Printf("Avertissement index: %v", err)
	}

	db := mongoDB.Database
	convCol := db.Collection("conversations")
	msgCol := db.Collection("messages")
	notifCol := db.Collection("notifications")

	// Nettoyage des anciennes données de test
	_ = convCol.Drop(ctx)
	_ = msgCol.Drop(ctx)
	_ = notifCol.Drop(ctx)
	_ = mongoDB.EnsureIndexes(ctx)

	// Utilisateurs de test
	aliceID := "user-alice-01"
	bobID := "user-bob-02"
	chloeID := "user-chloe-03"
	davidID := "user-david-04"

	now := time.Now().UTC()

	// 1. Conversation Directe : Alice & Bob (Entraide devoirs)
	convDirect := models.Conversation{
		ID:           primitive.NewObjectID(),
		Type:         models.ConversationTypeDirect,
		Participants: []string{aliceID, bobID},
		CreatedAt:    now.Add(-2 * time.Hour),
		UpdatedAt:    now.Add(-10 * time.Minute),
	}

	msg1 := models.Message{
		ID:             primitive.NewObjectID(),
		ConversationID: convDirect.ID,
		SenderID:       aliceID,
		Content:        "Bonjour Bob ! Est-ce que Lucas a compris le devoir de maths pour demain ?",
		ReadBy: []models.ReadReceipt{
			{UserID: aliceID, ReadAt: now.Add(-2 * time.Hour)},
			{UserID: bobID, ReadAt: now.Add(-1 * time.Hour)},
		},
		CreatedAt: now.Add(-2 * time.Hour),
	}

	msg2 := models.Message{
		ID:             primitive.NewObjectID(),
		ConversationID: convDirect.ID,
		SenderID:       bobID,
		Content:        "Salut Alice, oui ils peuvent réviser ensemble vers 17h si tu veux !",
		ReadBy: []models.ReadReceipt{
			{UserID: bobID, ReadAt: now.Add(-10 * time.Minute)},
		},
		CreatedAt: now.Add(-10 * time.Minute),
	}

	convDirect.LastMessage = &models.LastMessageSummary{
		MessageID: msg2.ID,
		SenderID:  msg2.SenderID,
		Content:   msg2.Content,
		CreatedAt: msg2.CreatedAt,
	}

	_, _ = convCol.InsertOne(ctx, convDirect)
	_, _ = msgCol.InsertOne(ctx, msg1)
	_, _ = msgCol.InsertOne(ctx, msg2)

	// 2. Conversation Babysitting : Alice & Chloé
	convBaby := models.Conversation{
		ID:   primitive.NewObjectID(),
		Type: models.ConversationTypeBabysitting,
		Context: &models.ConversationContext{
			ReferenceID: "booking-uuid-9876",
			Title:       "Garde du samedi soir - Thomas & Léa",
		},
		Participants: []string{aliceID, chloeID},
		CreatedAt:    now.Add(-1 * time.Hour),
		UpdatedAt:    now.Add(-5 * time.Minute),
	}

	msgBaby := models.Message{
		ID:             primitive.NewObjectID(),
		ConversationID: convBaby.ID,
		SenderID:       chloeID,
		Content:        "Bonjour Alice, j'ai bien accepté la garde. À samedi 19h !",
		ReadBy: []models.ReadReceipt{
			{UserID: chloeID, ReadAt: now.Add(-5 * time.Minute)},
		},
		CreatedAt: now.Add(-5 * time.Minute),
	}

	convBaby.LastMessage = &models.LastMessageSummary{
		MessageID: msgBaby.ID,
		SenderID:  msgBaby.SenderID,
		Content:   msgBaby.Content,
		CreatedAt: msgBaby.CreatedAt,
	}

	_, _ = convCol.InsertOne(ctx, convBaby)
	_, _ = msgCol.InsertOne(ctx, msgBaby)

	// 3. Conversation Marketplace : Bob & David (Prêt siège auto)
	convMarket := models.Conversation{
		ID:   primitive.NewObjectID(),
		Type: models.ConversationTypeMarketplace,
		Context: &models.ConversationContext{
			ReferenceID: "item-uuid-5432",
			Title:       "Prêt d'un siège auto groupe 2/3",
		},
		Participants: []string{bobID, davidID},
		CreatedAt:    now.Add(-30 * time.Minute),
		UpdatedAt:    now.Add(-30 * time.Minute),
		LastMessage: &models.LastMessageSummary{
			SenderID:  davidID,
			Content:   "Le siège auto est toujours disponible si tu en as besoin pour le week-end.",
			CreatedAt: now.Add(-30 * time.Minute),
		},
	}
	_, _ = convCol.InsertOne(ctx, convMarket)

	// 4. Notifications de démonstration
	notifs := []interface{}{
		models.Notification{
			ID:        primitive.NewObjectID(),
			UserID:    aliceID,
			Type:      models.NotificationTypeBookingAccepted,
			Title:     "Demande acceptée !",
			Message:   "Chloé a validé votre demande de babysitting pour samedi.",
			Read:      false,
			CreatedAt: now.Add(-5 * time.Minute),
		},
		models.Notification{
			ID:        primitive.NewObjectID(),
			UserID:    aliceID,
			Type:      models.NotificationTypeNewNeighborJoined,
			Title:     "Nouveau voisin dans le quartier !",
			Message:   "David vient de rejoindre ParentConnect près de chez vous.",
			Read:      true,
			CreatedAt: now.Add(-1 * time.Hour),
		},
		models.Notification{
			ID:        primitive.NewObjectID(),
			UserID:    bobID,
			Type:      models.NotificationTypeNewMessage,
			Title:     "Nouveau message",
			Message:   "Alice vous a envoyé un message : 'Bonjour Bob !'",
			Read:      false,
			CreatedAt: now.Add(-10 * time.Minute),
		},
	}
	_, _ = notifCol.InsertMany(ctx, notifs)

	// 5. Génération de tokens JWT de test pour Alice et Bob
	tokenAlice, _ := generateToken(cfg.JWTSecret, aliceID, "PARENT")
	tokenBob, _ := generateToken(cfg.JWTSecret, bobID, "PARENT")

	fmt.Println(" Données de seed insérées avec succès dans MongoDB !")
	fmt.Printf("   - 3 conversations créées (Directe, Babysitting, Marketplace)\n")
	fmt.Printf("   - 3 messages réels échangés\n")
	fmt.Printf("   - 3 notifications générées\n\n")

	fmt.Println("🔑 Tokens JWT de test générés (durée: 24h) :")
	fmt.Printf("   • Alice (ID: %s) :\n%s\n\n", aliceID, tokenAlice)
	fmt.Printf("   • Bob   (ID: %s) :\n%s\n\n", bobID, tokenBob)

	fmt.Println("📋 Exemples d'appels cURL prêts à tester :")
	fmt.Printf("   # Lister les conversations d'Alice :\n")
	fmt.Printf("   curl -H \"Authorization: Bearer %s\" http://localhost:8085/api/conversations\n\n", tokenAlice)
	fmt.Printf("   # Vérifier le badge de notifications non lues d'Alice :\n")
	fmt.Printf("   curl -H \"Authorization: Bearer %s\" http://localhost:8085/api/notifications/unread-count\n\n", tokenAlice)
	fmt.Printf("   # Tester la connexion WebSocket d'Alice :\n")
	fmt.Printf("   ws://localhost:8085/ws?token=%s\n", tokenAlice)
	fmt.Println("==========================================================")
}

func generateToken(secret, userID, role string) (string, error) {
	claims := &middleware.UserClaims{
		Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
