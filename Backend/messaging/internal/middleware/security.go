package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/parentconnect/messaging-service/internal/models"
)

// SecurityHeadersMiddleware injecte les en-têtes HTTP de sécurité recommandés par l'OWASP
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("X-XSS-Protection", "1; mode=block")
		c.Writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}

// MaxBodySizeMiddleware restreint la taille maximale acceptée pour le corps des requêtes HTTP (1 Mo par défaut)
func MaxBodySizeMiddleware(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}

// CORSMiddleware gère les requêtes Cross-Origin pour le frontend Angular
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		// Autorise les requêtes depuis l'application frontend Angular et l'environnement local
		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Request-ID, X-Internal-Key")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// GlobalErrorHandler intercepte les dépassements de taille de corps
func BodySizeErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if len(c.Errors) > 0 {
			for _, e := range c.Errors {
				if e.Type == gin.ErrorTypeBind {
					c.JSON(http.StatusRequestEntityTooLarge, models.StandardResponse{
						Success: false,
						Error:   "Le corps de la requête dépasse la taille maximale autorisée",
					})
					return
				}
			}
		}
	}
}
