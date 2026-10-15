package unit

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/parentconnect/messaging-service/internal/config"
	"github.com/parentconnect/messaging-service/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTokenValidator_HS256(t *testing.T) {
	secret := "test-secret-key-parentconnect-32chars"
	cfg := &config.Config{
		JWTAlgorithm: "HS256",
		JWTSecret:    secret,
	}

	validator, err := middleware.NewTokenValidator(cfg)
	require.NoError(t, err)

	t.Run("Validation réussie d'un token valide", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, &middleware.UserClaims{
			Role: "PARENT",
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   "user-parent-123",
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
			},
		})
		tokenString, err := token.SignedString([]byte(secret))
		require.NoError(t, err)

		claims, err := validator.ValidateToken(tokenString)
		assert.NoError(t, err)
		assert.Equal(t, "user-parent-123", claims.Subject)
		assert.Equal(t, "PARENT", claims.Role)
	})

	t.Run("Rejet d'un token expiré", func(t *testing.T) {
		expiredToken := jwt.NewWithClaims(jwt.SigningMethodHS256, &middleware.UserClaims{
			Role: "PARENT",
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   "user-parent-123",
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)), // Expiré il y a 1h
			},
		})
		tokenString, err := expiredToken.SignedString([]byte(secret))
		require.NoError(t, err)

		_, err = validator.ValidateToken(tokenString)
		assert.Error(t, err)
	})

	t.Run("Rejet avec mauvaise signature secrète", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, &middleware.UserClaims{
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   "user-parent-123",
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
			},
		})
		tokenString, err := token.SignedString([]byte("wrong-secret-key"))
		require.NoError(t, err)

		_, err = validator.ValidateToken(tokenString)
		assert.Error(t, err)
	})

	t.Run("Rejet si claim Subject (user_id) manquant", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, &middleware.UserClaims{
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   "", // Vide
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
			},
		})
		tokenString, err := token.SignedString([]byte(secret))
		require.NoError(t, err)

		_, err = validator.ValidateToken(tokenString)
		assert.Error(t, err)
	})
}
