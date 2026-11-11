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

// KeycloakRealmAccess représente le claim `realm_access` d'un token Keycloak.
type KeycloakRealmAccess struct {
	Roles []string `json:"roles"`
}

// KeycloakClaims étend les claims JWT standard avec les champs spécifiques à Keycloak.
// Le claim `realm_access.roles` contient les rôles du realm ParentConnect.
type KeycloakClaims struct {
	RealmAccess       KeycloakRealmAccess `json:"realm_access"`
	PreferredUsername string              `json:"preferred_username"`
	jwt.RegisteredClaims
}

// UserClaims définit les données extraites et normalisées du token (Keycloak ou Identity service)
type UserClaims struct {
	Role string `json:"role,omitempty"`
	jwt.RegisteredClaims
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
			return nil, errors.New("l'algorithme RS256 requiert KEYCLOAK_REALM_PUBLIC_KEY ou JWT_PUBLIC_KEY (contenu PEM ou chemin de fichier)")
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

// extractPrimaryRole retourne le rôle ParentConnect de plus haute priorité depuis la liste
// des rôles Keycloak (realm_access.roles). Priorité : ADMIN > PROFESSIONAL > PARENT.
func extractPrimaryRole(roles []string) string {
	priority := map[string]int{"ADMIN": 3, "PROFESSIONAL": 2, "PARENT": 1}
	best := ""
	bestScore := 0
	for _, r := range roles {
		upper := strings.ToUpper(r)
		if score, ok := priority[upper]; ok && score > bestScore {
			best = upper
			bestScore = score
		}
	}
	return best
}

// ValidateKeycloakToken décode un token Keycloak RS256 et extrait l'identité normalisée.
// Extrait `sub` comme user_id et le rôle dominant de `realm_access.roles`.
func (tv *TokenValidator) ValidateKeycloakToken(tokenString string) (*UserClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &KeycloakClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("%w: attendu RS256, reçu %v", ErrInvalidAlgorithm, t.Header["alg"])
		}
		return tv.rsaPubKey, nil
	})

	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	kc, ok := token.Claims.(*KeycloakClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	if kc.Subject == "" {
		return nil, errors.New("token Keycloak invalide: claim 'sub' manquant")
	}

	role := extractPrimaryRole(kc.RealmAccess.Roles)

	return &UserClaims{
		Role:             role,
		RegisteredClaims: kc.RegisteredClaims,
	}, nil
}

// ValidateToken décode et valide la signature et la validité temporelle du token.
// Pour RS256, utilise automatiquement le parsing Keycloak (realm_access.roles).
func (tv *TokenValidator) ValidateToken(tokenString string) (*UserClaims, error) {
	// RS256 → parsing Keycloak complet (realm_access.roles)
	if tv.algorithm == "RS256" {
		return tv.ValidateKeycloakToken(tokenString)
	}

	// HS256 → parsing classique claims simples (Identity service interne)
	token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("%w: attendu HS256, reçu %v", ErrInvalidAlgorithm, t.Header["alg"])
		}
		return tv.secretKey, nil
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

// AuthMiddleware protège les routes REST avec double mode :
//
// Mode Relay Gateway (défense en profondeur & performance) :
// Si X-Gateway-Auth: verified est présent, fait confiance à X-User-Id / X-User-Role
// propagés par la Gateway sans recalculer la signature JWT.
//
// Mode Direct (JWT Bearer) :
// Valide le token JWT (Keycloak RS256 ou HS256) et extrait l'identité.
func AuthMiddleware(validator *TokenValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ── Mode Relay Gateway (X-Gateway-Auth: verified) ──────────────────────
		// La Gateway a déjà vérifié le token Keycloak en amont. On fait confiance
		// aux headers propagés pour éviter une double vérification cryptographique.
		if c.GetHeader("X-Gateway-Auth") == "verified" {
			userID := c.GetHeader("X-User-Id")
			userRole := c.GetHeader("X-User-Role")

			if userID == "" {
				c.JSON(http.StatusUnauthorized, models.StandardResponse{
					Success: false,
					Error:   "Header X-User-Id manquant malgré X-Gateway-Auth: verified",
				})
				c.Abort()
				return
			}

			c.Set("user_id", userID)
			c.Set("user_role", userRole)
			c.Next()
			return
		}

		// ── Mode Direct : validation JWT Bearer ────────────────────────────────
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
		c.Set("user_role", claims.Role)
		c.Set("user_claims", claims)

		c.Next()
	}
}

// RequireRole renvoie 403 Forbidden si le rôle de l'utilisateur authentifié
// n'est pas dans la liste des rôles autorisés.
func RequireRole(allowedRoles ...string) gin.HandlerFunc {
	roleSet := make(map[string]struct{}, len(allowedRoles))
	for _, r := range allowedRoles {
		roleSet[strings.ToUpper(r)] = struct{}{}
	}
	return func(c *gin.Context) {
		role, _ := c.Get("user_role")
		roleStr, _ := role.(string)
		if _, ok := roleSet[strings.ToUpper(roleStr)]; !ok {
			c.JSON(http.StatusForbidden, models.StandardResponse{
				Success: false,
				Error:   fmt.Sprintf("Accès refusé : rôle '%s' insuffisant pour cette ressource", roleStr),
			})
			c.Abort()
			return
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
