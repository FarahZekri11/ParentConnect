package middleware

import (
	"crypto/rsa"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/parentconnect/messaging-service/internal/config"
	"github.com/parentconnect/messaging-service/internal/models"
)

var (
	ErrMissingAuthHeader = errors.New("en-tête d'autorisation manquant ou invalide")
	ErrInvalidToken      = errors.New("jeton d'authentification invalide ou expiré")
	ErrInvalidAlgorithm  = errors.New("algorithme de signature inattendu")
)

// UserClaims définit les données extraites du token émis par le microservice Identity
type UserClaims struct {
	Role string `json:"role,omitempty"`
	// Nom affiché (claim Keycloak "name"), repli sur "preferred_username"
	Name              string `json:"name,omitempty"`
	PreferredUsername string `json:"preferred_username,omitempty"`
	// Rôles du realm Keycloak (ADMIN, PROFESSIONAL, PARENT...)
	RealmAccess struct {
		Roles []string `json:"roles"`
	} `json:"realm_access,omitempty"`
	jwt.RegisteredClaims
}

// PrimaryRole renvoie le rôle métier principal : claim "role" s'il est présent, sinon le rôle le plus
// élevé de realm_access.roles (ADMIN > PROFESSIONAL > BABYSITTER > PARENT).
func (c *UserClaims) PrimaryRole() string {
	if c.Role != "" {
		return strings.ToUpper(c.Role)
	}
	roles := make(map[string]bool, len(c.RealmAccess.Roles))
	for _, r := range c.RealmAccess.Roles {
		roles[strings.ToUpper(r)] = true
	}
	for _, candidate := range []string{"ADMIN", "PROFESSIONAL", "BABYSITTER", "PARENT"} {
		if roles[candidate] {
			return candidate
		}
	}
	return ""
}

// TokenValidator gère la vérification cryptographique des JWT
type TokenValidator struct {
	algorithm string
	secretKey []byte
	rsaPubKey *rsa.PublicKey
}

// NewTokenValidator initialise le validateur selon l'algorithme choisi (RS256 ou HS256)
func NewTokenValidator(cfg *config.Config) (*TokenValidator, error) {
	tv := &TokenValidator{
		algorithm: strings.ToUpper(cfg.JWTAlgorithm),
	}

	switch tv.algorithm {
	case "RS256":
		var pubKeyBytes []byte
		// Vérifie si la variable contient directement le PEM ou un chemin vers un fichier .pem
		if strings.HasPrefix(strings.TrimSpace(cfg.JWTPublicKey), "-----BEGIN") {
			pubKeyBytes = []byte(cfg.JWTPublicKey)
		} else if cfg.JWTPublicKey != "" {
			var err error
			pubKeyBytes, err = os.ReadFile(cfg.JWTPublicKey)
			if err != nil {
				return nil, fmt.Errorf("impossible de lire le fichier de clé publique RS256: %w", err)
			}
		} else {
			return nil, errors.New("l'algorithme RS256 requiert JWT_PUBLIC_KEY (contenu PEM ou chemin de fichier)")
		}

		pubKey, err := jwt.ParseRSAPublicKeyFromPEM(pubKeyBytes)
		if err != nil {
			return nil, fmt.Errorf("clé publique RSA invalide: %w", err)
		}
		tv.rsaPubKey = pubKey

	case "HS256":
		if cfg.JWTSecret == "" {
			return nil, errors.New("l'algorithme HS256 requiert JWT_SECRET")
		}
		tv.secretKey = []byte(cfg.JWTSecret)

	default:
		return nil, fmt.Errorf("algorithme JWT non supporté: %s (utilisez RS256 ou HS256)", cfg.JWTAlgorithm)
	}

	return tv, nil
}

// ValidateToken décode et valide la signature et la validité temporelle du token
func (tv *TokenValidator) ValidateToken(tokenString string) (*UserClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(t *jwt.Token) (interface{}, error) {
		// Vérification stricte que l'algorithme du token correspond exactement à celui configuré
		if tv.algorithm == "RS256" {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("%w: attendu RS256, reçu %v", ErrInvalidAlgorithm, t.Header["alg"])
			}
			return tv.rsaPubKey, nil
		}

		if tv.algorithm == "HS256" {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("%w: attendu HS256, reçu %v", ErrInvalidAlgorithm, t.Header["alg"])
			}
			return tv.secretKey, nil
		}

		return nil, ErrInvalidAlgorithm
	})

	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	claims, ok := token.Claims.(*UserClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	if claims.Subject == "" {
		return nil, errors.New("token invalide: claim 'sub' (user_id) manquant")
	}

	return claims, nil
}

// AuthMiddleware protège les routes REST publiques en exigeant un token JWT valide
func AuthMiddleware(validator *TokenValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, models.StandardResponse{
				Success: false,
				Error:   "En-tête Authorization manquant",
			})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.JSON(http.StatusUnauthorized, models.StandardResponse{
				Success: false,
				Error:   "Format attendu: Bearer <token>",
			})
			c.Abort()
			return
		}

		claims, err := validator.ValidateToken(parts[1])
		if err != nil {
			c.JSON(http.StatusUnauthorized, models.StandardResponse{
				Success: false,
				Error:   err.Error(),
			})
			c.Abort()
			return
		}

		// Injection des données d'identité dans le contexte Gin
		c.Set("user_id", claims.Subject)
		c.Set("user_role", claims.PrimaryRole())
		c.Set("user_claims", claims)
		if claims.Name != "" {
			c.Set("user_name", claims.Name)
		} else if claims.PreferredUsername != "" {
			c.Set("user_name", claims.PreferredUsername)
		}

		c.Next()
	}
}

// InternalAuthMiddleware protège les routes réservées aux appels inter-microservices (via X-Internal-Key)
func InternalAuthMiddleware(expectedAPIKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		providedKey := c.GetHeader("X-Internal-Key")
		if providedKey == "" || providedKey != expectedAPIKey {
			c.JSON(http.StatusForbidden, models.StandardResponse{
				Success: false,
				Error:   "Accès interdit : clé interne manquante ou invalide",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
