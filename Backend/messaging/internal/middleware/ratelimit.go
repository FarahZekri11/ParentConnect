package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/parentconnect/messaging-service/internal/database"
	"github.com/parentconnect/messaging-service/internal/models"
)

// RateLimiter gère la limitation de débit basée sur Redis avec fenêtre glissante
type RateLimiter struct {
	redisClient *database.Redis
	limit       int           // Nombre max de requêtes
	window      time.Duration // Fenêtre de temps
}

// NewRateLimiter instancie un limiteur de débit
func NewRateLimiter(redis *database.Redis, limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		redisClient: redis,
		limit:       limit,
		window:      window,
	}
}

// LimitByIP applique le rate limiting basé sur l'adresse IP cliente
func (rl *RateLimiter) LimitByIP() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		key := fmt.Sprintf("ratelimit:ip:%s", ip)
		rl.checkLimit(c, key)
	}
}

// LimitByUser applique le rate limiting basé sur le user_id authentifié
func (rl *RateLimiter) LimitByUser() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		if userID == "" {
			c.Next()
			return
		}
		key := fmt.Sprintf("ratelimit:user:%s", userID)
		rl.checkLimit(c, key)
	}
}

func (rl *RateLimiter) checkLimit(c *gin.Context, key string) {
	if rl.redisClient == nil || rl.redisClient.Client == nil {
		c.Next() // Si Redis non dispo, bypass silencieux pour ne pas bloquer le service
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 1*time.Second)
	defer cancel()

	// Incrément atomique dans Redis
	count, err := rl.redisClient.Client.Incr(ctx, key).Result()
	if err != nil {
		c.Next()
		return
	}

	// Lors de la première requête, fixer l'expiration
	if count == 1 {
		rl.redisClient.Client.Expire(ctx, key, rl.window)
	}

	c.Writer.Header().Set("X-RateLimit-Limit", strconv.Itoa(rl.limit))
	remaining := rl.limit - int(count)
	if remaining < 0 {
		remaining = 0
	}
	c.Writer.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))

	if count > int64(rl.limit) {
		c.Writer.Header().Set("Retry-After", strconv.Itoa(int(rl.window.Seconds())))
		c.JSON(http.StatusTooManyRequests, models.StandardResponse{
			Success: false,
			Error:   fmt.Sprintf("Trop de requêtes. Veuillez patienter %v secondes.", int(rl.window.Seconds())),
		})
		c.Abort()
		return
	}

	c.Next()
}
