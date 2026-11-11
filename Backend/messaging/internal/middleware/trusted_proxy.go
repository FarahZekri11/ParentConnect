package middleware

import (
	"net"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/parentconnect/messaging-service/internal/config"
)

// trustedNetworks liste les plages CIDR des réseaux internes Docker / Kubernetes
// depuis lesquels les requêtes légitimes doivent provenir (via la Gateway).
var trustedNetworks = []string{
	"172.0.0.0/8",  // Réseau bridge Docker par défaut
	"10.0.0.0/8",   // Réseau interne Kubernetes / overlay Docker
	"192.168.0.0/16", // Réseau local / VPN
	"127.0.0.1/32",   // Loopback (tests locaux)
}

// parsedTrustedNets contient les *net.IPNet déjà parsés au démarrage.
var parsedTrustedNets []*net.IPNet

func init() {
	for _, cidr := range trustedNetworks {
		_, network, err := net.ParseCIDR(cidr)
		if err == nil {
			parsedTrustedNets = append(parsedTrustedNets, network)
		}
	}
}

// TrustedProxyMiddleware vérifie que les requêtes proviennent bien d'une Gateway
// de confiance en contrôlant la présence du header X-Forwarded-For.
//
// Comportement selon l'environnement (cfg.AppEnv) :
//   - "production"  : bloque les requêtes sans X-Forwarded-For sur les routes /api
//                     avec HTTP 403. Les routes /health et /ready sont exemptées.
//   - "development" : log un avertissement mais laisse la requête passer.
//
// Ce middleware doit être enregistré APRÈS les middlewares RequestID et Logger
// pour que l'ID de corrélation soit déjà disponible dans les logs.
func TrustedProxyMiddleware(cfg *config.Config) gin.HandlerFunc {
	isProduction := cfg.AppEnv == "production"

	return func(c *gin.Context) {
		// Exemptions : sondes de santé et readiness (jamais soumises au proxy check)
		path := c.Request.URL.Path
		if path == "/health" || path == "/ready" {
			c.Next()
			return
		}

		// Vérification du header X-Forwarded-For (injecté par Nginx / Spring Cloud Gateway)
		xff := c.GetHeader("X-Forwarded-For")
		if xff == "" {
			requestID, _ := c.Get("request_id")

			if isProduction {
				// En production : refus strict – la requête ne passe pas par la Gateway
				logger, exists := c.Get("logger")
				if exists {
					if zapLogger, ok := logger.(*zap.Logger); ok {
						zapLogger.Warn("TrustedProxy: requête sans X-Forwarded-For bloquée en production",
							zap.String("path", path),
							zap.String("remote_addr", c.ClientIP()),
							zap.Any("request_id", requestID),
						)
					}
				}

				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"success": false,
					"error":   "Forbidden: Direct access to this service is not allowed. All requests must transit through the API Gateway.",
					"code":    "DIRECT_ACCESS_FORBIDDEN",
				})
				return
			}

			// En développement : warning mais on laisse passer pour faciliter les tests locaux
			logger, exists := c.Get("logger")
			if exists {
				if zapLogger, ok := logger.(*zap.Logger); ok {
					zapLogger.Warn("TrustedProxy: X-Forwarded-For absent (mode développement – requête autorisée mais non conforme)",
						zap.String("path", path),
						zap.String("remote_addr", c.ClientIP()),
						zap.Any("request_id", requestID),
					)
				}
			}
		}

		c.Next()
	}
}

// isFromTrustedNetwork vérifie si une adresse IP appartient à l'un des réseaux
// de confiance définis dans trustedNetworks. Utilisé pour des validations avancées
// (par exemple, valider l'IP upstream dans X-Forwarded-For plutôt que simplement
// sa présence).
func isFromTrustedNetwork(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}

	for _, network := range parsedTrustedNets {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}
