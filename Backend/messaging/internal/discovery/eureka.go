package discovery

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

// EurekaClient gère l'enregistrement et les heartbeats vers le serveur Spring Cloud Eureka.
type EurekaClient struct {
	serverURL    string
	appName      string
	instanceID   string
	instanceHost string
	port         int
	client       *http.Client
	logger       *zap.Logger
}

// EurekaPort wrapper pour le format de port attendu par Eureka.
type EurekaPort struct {
	Port    int    `json:"$"`
	Enabled string `json:"@enabled"`
}

// EurekaDataCenterInfo métadonnées de datacenter standard pour Eureka hors AWS.
type EurekaDataCenterInfo struct {
	Class string `json:"@class"`
	Name  string `json:"name"`
}

// EurekaInstancePayload structure officielle d'enregistrement d'instance Netflix Eureka.
type EurekaInstancePayload struct {
	Instance struct {
		InstanceID       string               `json:"instanceId"`
		HostName         string               `json:"hostName"`
		App              string               `json:"app"`
		IPAddr           string               `json:"ipAddr"`
		Status           string               `json:"status"`
		Port             EurekaPort           `json:"port"`
		SecurePort       EurekaPort           `json:"securePort"`
		DataCenterInfo   EurekaDataCenterInfo `json:"dataCenterInfo"`
		HomePageURL      string               `json:"homePageUrl"`
		StatusPageURL    string               `json:"statusPageUrl"`
		HealthCheckURL   string               `json:"healthCheckUrl"`
		VipAddress       string               `json:"vipAddress"`
		SecureVipAddress string               `json:"secureVipAddress"`
	} `json:"instance"`
}

// NewEurekaClient initialise le client Eureka.
func NewEurekaClient(serverURL, appName, instanceHost, portStr string, logger *zap.Logger) *EurekaClient {
	port, err := strconv.Atoi(portStr)
	if err != nil {
		port = 8085
	}
	normalizedURL := strings.TrimRight(serverURL, "/")
	normalizedAppName := strings.ToUpper(appName)
	instanceID := fmt.Sprintf("%s:%s:%d", instanceHost, normalizedAppName, port)

	return &EurekaClient{
		serverURL:    normalizedURL,
		appName:      normalizedAppName,
		instanceID:   instanceID,
		instanceHost: instanceHost,
		port:         port,
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
		logger: logger,
	}
}

// Register enregistre le microservice auprès d'Eureka.
func (e *EurekaClient) Register(ctx context.Context) error {
	url := fmt.Sprintf("%s/apps/%s", e.serverURL, e.appName)

	payload := EurekaInstancePayload{}
	payload.Instance.InstanceID = e.instanceID
	payload.Instance.HostName = e.instanceHost
	payload.Instance.App = e.appName
	payload.Instance.IPAddr = "127.0.0.1"
	payload.Instance.Status = "UP"
	payload.Instance.Port = EurekaPort{Port: e.port, Enabled: "true"}
	payload.Instance.SecurePort = EurekaPort{Port: 443, Enabled: "false"}
	payload.Instance.DataCenterInfo = EurekaDataCenterInfo{
		Class: "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo",
		Name:  "MyOwn",
	}
	baseURL := fmt.Sprintf("http://%s:%d", e.instanceHost, e.port)
	payload.Instance.HomePageURL = baseURL + "/"
	payload.Instance.StatusPageURL = baseURL + "/health"
	payload.Instance.HealthCheckURL = baseURL + "/health"
	payload.Instance.VipAddress = e.appName
	payload.Instance.SecureVipAddress = e.appName

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("erreur sérialisation payload eureka: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("erreur création requête eureka: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("échec de connexion au serveur Eureka (%s): %w", e.serverURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("réponse inattendue de Eureka (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	e.logger.Info("✅ Microservice enregistré avec succès sur Eureka Discovery",
		zap.String("eureka_url", e.serverURL),
		zap.String("app", e.appName),
		zap.String("instance_id", e.instanceID),
	)
	return nil
}

// SendHeartbeat envoie le renouvellement de bail (heartbeat) toutes les 30s.
func (e *EurekaClient) SendHeartbeat(ctx context.Context) error {
	url := fmt.Sprintf("%s/apps/%s/%s", e.serverURL, e.appName, e.instanceID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// Instance déréférencée côté Eureka (par ex. redémarrage d'Eureka), on se réenregistre
		e.logger.Warn("Instance Eureka introuvable (404), tentative de réenregistrement...")
		return e.Register(ctx)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("heartbeat rejeté avec le code HTTP %d", resp.StatusCode)
	}
	return nil
}

// Deregister retire le microservice d'Eureka lors d'un arrêt gracieux.
func (e *EurekaClient) Deregister(ctx context.Context) error {
	url := fmt.Sprintf("%s/apps/%s/%s", e.serverURL, e.appName, e.instanceID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	e.logger.Info("Microservice retiré d'Eureka avec succès (Deregister)",
		zap.String("instance_id", e.instanceID),
	)
	return nil
}

// StartLifeCycle lance l'enregistrement et la boucle de heartbeat dans une goroutine.
func (e *EurekaClient) StartLifeCycle(ctx context.Context) {
	// 1er essai d'enregistrement
	if err := e.Register(ctx); err != nil {
		e.logger.Warn("Enregistrement initial Eureka différé (en attente du serveur Eureka)", zap.Error(err))
	}

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			_ = e.Deregister(shutdownCtx)
			cancel()
			return
		case <-ticker.C:
			if err := e.SendHeartbeat(ctx); err != nil {
				e.logger.Debug("Échec du heartbeat Eureka (reconnexion automatique prévue)", zap.Error(err))
			}
		}
	}
}
