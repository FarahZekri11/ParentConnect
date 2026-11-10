<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * Service client pour l'intégration de Laravel avec Netflix Eureka Server (Spring Cloud).
 * Utilise l'API REST native d'Eureka sans nécessiter de dépendance externe.
 */
class EurekaClientService
{
    protected string $serverUrl;
    protected string $appName;
    protected string $instanceHost;
    protected int $port;
    protected int $heartbeatInterval;
    protected int $leaseDuration;
    protected string $healthPath;
    protected string $homePath;
    protected string $instanceId;

    public function __construct()
    {
        $this->serverUrl = rtrim((string) config('eureka.server_url', 'http://eureka-server:8761/eureka/'), '/') . '/';
        $this->appName = strtoupper((string) config('eureka.app_name', 'parentconnect-laravel'));
        $this->instanceHost = (string) config('eureka.instance_host', 'parentconnect-community-api');
        $this->port = (int) config('eureka.port', 8000);
        $this->heartbeatInterval = (int) config('eureka.heartbeat_interval', 30);
        $this->leaseDuration = (int) config('eureka.lease_duration', 90);
        $this->healthPath = (string) config('eureka.health_path', '/api/health');
        $this->homePath = (string) config('eureka.home_path', '/');

        // Format d'instanceId standard compatible Spring Cloud : host:appName:port
        $this->instanceId = sprintf('%s:%s:%d', $this->instanceHost, strtolower($this->appName), $this->port);
    }

    public function getInstanceId(): string
    {
        return $this->instanceId;
    }

    public function getAppName(): string
    {
        return $this->appName;
    }

    public function getServerUrl(): string
    {
        return $this->serverUrl;
    }

    /**
     * Enregistre l'instance auprès d'Eureka Server.
     * Envoie POST /eureka/apps/{appName}
     *
     * @return array{success: bool, status_code: int, message: string}
     */
    public function register(): array
    {
        $url = $this->serverUrl . 'apps/' . rawurlencode($this->appName);

        $payload = [
            'instance' => [
                'instanceId' => $this->instanceId,
                'hostName' => $this->instanceHost,
                'app' => $this->appName,
                'ipAddr' => $this->instanceHost,
                'status' => 'UP',
                'overriddenStatus' => 'UNKNOWN',
                'port' => [
                    '$' => $this->port,
                    '@enabled' => 'true',
                ],
                'securePort' => [
                    '$' => 443,
                    '@enabled' => 'false',
                ],
                'countryId' => 1,
                'dataCenterInfo' => [
                    '@class' => 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
                    'name' => 'MyOwn',
                ],
                'leaseInfo' => [
                    'renewalIntervalInSecs' => $this->heartbeatInterval,
                    'durationInSecs' => $this->leaseDuration,
                ],
                'metadata' => [
                    'management.port' => (string) $this->port,
                    'framework' => 'laravel',
                    'version' => '12.x',
                ],
                'homePageUrl' => sprintf('http://%s:%d%s', $this->instanceHost, $this->port, $this->homePath),
                'statusPageUrl' => sprintf('http://%s:%d%s', $this->instanceHost, $this->port, $this->healthPath),
                'healthCheckUrl' => sprintf('http://%s:%d%s', $this->instanceHost, $this->port, $this->healthPath),
                'vipAddress' => strtolower($this->appName),
                'secureVipAddress' => strtolower($this->appName),
            ],
        ];

        $jsonPayload = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $response = $this->executeCurl('POST', $url, $jsonPayload);

        // Eureka retourne HTTP 204 (No Content) en cas de succès d'enregistrement
        if ($response['status_code'] === 204 || $response['status_code'] === 200) {
            Log::info(sprintf('[Eureka] Enregistrement réussi pour %s (%s) sur %s', $this->appName, $this->instanceId, $this->serverUrl));
            return [
                'success' => true,
                'status_code' => $response['status_code'],
                'message' => 'Instance enregistrée avec succès dans Eureka',
            ];
        }

        Log::error(sprintf('[Eureka] Échec enregistrement (%d): %s', $response['status_code'], $response['body']));
        return [
            'success' => false,
            'status_code' => $response['status_code'],
            'message' => 'Échec d\'enregistrement auprès d\'Eureka : ' . ($response['error'] ?: $response['body']),
        ];
    }

    /**
     * Envoie le heartbeat (renouvellement de bail) à Eureka.
     * Envoie PUT /eureka/apps/{appName}/{instanceId}
     *
     * @return array{success: bool, status_code: int, message: string}
     */
    public function heartbeat(): array
    {
        $url = $this->serverUrl . 'apps/' . rawurlencode($this->appName) . '/' . rawurlencode($this->instanceId);

        $response = $this->executeCurl('PUT', $url);

        // HTTP 200 : Heartbeat accepté
        if ($response['status_code'] === 200) {
            return [
                'success' => true,
                'status_code' => 200,
                'message' => 'Heartbeat envoyé avec succès',
            ];
        }

        // HTTP 404 : Eureka a perdu l'instance (ex: redémarrage serveur ou expiration de bail)
        if ($response['status_code'] === 404) {
            Log::warning('[Eureka] Instance inconnue (404) lors du heartbeat. Tentative de ré-enregistrement...');
            return $this->register();
        }

        Log::warning(sprintf('[Eureka] Heartbeat refusé (%d) : %s', $response['status_code'], $response['error'] ?: $response['body']));
        return [
            'success' => false,
            'status_code' => $response['status_code'],
            'message' => 'Échec heartbeat: ' . ($response['error'] ?: $response['body']),
        ];
    }

    /**
     * Supprime l'instance d'Eureka lors de l'arrêt du conteneur.
     * Envoie DELETE /eureka/apps/{appName}/{instanceId}
     *
     * @return array{success: bool, status_code: int, message: string}
     */
    public function deregister(): array
    {
        $url = $this->serverUrl . 'apps/' . rawurlencode($this->appName) . '/' . rawurlencode($this->instanceId);

        $response = $this->executeCurl('DELETE', $url);

        if ($response['status_code'] === 200 || $response['status_code'] === 204) {
            Log::info(sprintf('[Eureka] Instance %s déréférencée avec succès.', $this->instanceId));
            return [
                'success' => true,
                'status_code' => $response['status_code'],
                'message' => 'Instance déréférencée d\'Eureka',
            ];
        }

        return [
            'success' => false,
            'status_code' => $response['status_code'],
            'message' => 'Échec de déréférencement: ' . ($response['error'] ?: $response['body']),
        ];
    }

    /**
     * Interroge l'état d'enregistrement de l'instance dans Eureka.
     *
     * @return array{registered: bool, status_code: int, details: mixed}
     */
    public function queryStatus(): array
    {
        $url = $this->serverUrl . 'apps/' . rawurlencode($this->appName) . '/' . rawurlencode($this->instanceId);

        $response = $this->executeCurl('GET', $url);

        if ($response['status_code'] === 200) {
            $data = json_decode($response['body'], true);
            return [
                'registered' => true,
                'status_code' => 200,
                'details' => $data['instance'] ?? $data,
            ];
        }

        return [
            'registered' => false,
            'status_code' => $response['status_code'],
            'details' => $response['error'] ?: 'Instance introuvable dans Eureka',
        ];
    }

    /**
     * Exécute un appel HTTP cURL natif avec gestion des timeouts.
     *
     * @return array{status_code: int, body: string, error: string}
     */
    protected function executeCurl(string $method, string $url, ?string $body = null): array
    {
        $ch = curl_init();

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
        ];

        if ($body !== null) {
            $headers[] = 'Content-Length: ' . strlen($body);
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $responseBody = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);

        curl_close($ch);

        return [
            'status_code' => $statusCode,
            'body' => (string) $responseBody,
            'error' => $error,
        ];
    }
}
