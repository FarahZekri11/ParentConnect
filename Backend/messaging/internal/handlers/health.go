package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/parentconnect/messaging-service/internal/database"
)

// HealthHandler gère les sondes de liveness et readiness
type HealthHandler struct {
	mongo *database.MongoDB
	redis *database.Redis
}

// NewHealthHandler instancie le handler avec ses dépendances
func NewHealthHandler(mongo *database.MongoDB, redis *database.Redis) *HealthHandler {
	return &HealthHandler{
		mongo: mongo,
		redis: redis,
	}
}

// HealthResponse représente la structure de réponse pour /health
type HealthResponse struct {
	Status    string `json:"status" example:"UP"`
	Service   string `json:"service" example:"messaging"`
	Timestamp string `json:"timestamp" example:"2026-10-15T19:00:00Z"`
}

// ReadyResponse représente la structure de réponse pour /ready
type ReadyResponse struct {
	Status    string            `json:"status" example:"READY"`
	Service   string            `json:"service" example:"messaging"`
	Checks    map[string]string `json:"checks"`
	Timestamp string            `json:"timestamp" example:"2026-10-15T19:00:00Z"`
}

// HealthCheck godoc
// @Summary      Sonde de liveness (Liveness Probe)
// @Description  Indique si l'application HTTP tourne et répond. Ne teste pas les dépendances externes.
// @Tags         Supervision
// @Produce      json
// @Success      200  {object}  HealthResponse
// @Router       /health [get]
func (h *HealthHandler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, HealthResponse{
		Status:    "UP",
		Service:   "messaging",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// ReadinessCheck godoc
// @Summary      Sonde de readiness (Readiness Probe)
// @Description  Vérifie que le service est prêt à recevoir du trafic (connexions MongoDB et Redis actives).
// @Tags         Supervision
// @Produce      json
// @Success      200  {object}  ReadyResponse
// @Failure      503  {object}  ReadyResponse
// @Router       /ready [get]
func (h *HealthHandler) ReadinessCheck(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	checks := make(map[string]string)
	isReady := true

	// Test MongoDB
	if h.mongo != nil {
		if err := h.mongo.Ping(ctx); err != nil {
			checks["mongodb"] = "DOWN: " + err.Error()
			isReady = false
		} else {
			checks["mongodb"] = "UP"
		}
	} else {
		checks["mongodb"] = "UNINITIALIZED"
		isReady = false
	}

	// Test Redis
	if h.redis != nil {
		if err := h.redis.Ping(ctx); err != nil {
			checks["redis"] = "DOWN: " + err.Error()
			isReady = false
		} else {
			checks["redis"] = "UP"
		}
	} else {
		checks["redis"] = "UNINITIALIZED"
		isReady = false
	}

	statusCode := http.StatusOK
	statusText := "READY"
	if !isReady {
		statusCode = http.StatusServiceUnavailable
		statusText = "NOT_READY"
	}

	c.JSON(statusCode, ReadyResponse{
		Status:    statusText,
		Service:   "messaging",
		Checks:    checks,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}
