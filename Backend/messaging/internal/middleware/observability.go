package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

const HeaderXRequestID = "X-Request-ID"

// RequestIDMiddleware injecte ou propage le X-Request-ID
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		reqID := c.GetHeader(HeaderXRequestID)
		if reqID == "" {
			reqID = uuid.New().String()
		}
		c.Set("request_id", reqID)
		c.Writer.Header().Set(HeaderXRequestID, reqID)
		c.Next()
	}
}

// StructuredLoggerMiddleware produit des logs JSON contenant service=messaging, request_id et user_id
func StructuredLoggerMiddleware(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		statusCode := c.Writer.Status()

		reqID, _ := c.Get("request_id")
		userID, exists := c.Get("user_id")
		if !exists {
			userID = "anonymous"
		}

		logger.Info("HTTP Request",
			zap.String("service", "messaging"),
			zap.Any("request_id", reqID),
			zap.Any("user_id", userID),
			zap.Int("status", statusCode),
			zap.String("method", c.Request.Method),
			zap.String("path", path),
			zap.String("query", query),
			zap.String("client_ip", c.ClientIP()),
			zap.Duration("latency", latency),
		)
	}
}
