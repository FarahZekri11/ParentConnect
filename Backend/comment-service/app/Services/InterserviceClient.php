<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\PendingRequest;

/**
 * Client HTTP pour la communication inter-microservices.
 * Assure le transfert transparent du token d'authentification Keycloak (Bearer)
 * et des en-têtes d'identité propagés par l'API Gateway.
 */
class InterserviceClient
{
    public static function forService(string $serviceUrl): PendingRequest
    {
        $client = Http::baseUrl(rtrim($serviceUrl, '/'))
            ->timeout(5)
            ->acceptJson();

        // Propagation du Bearer Token (Keycloak RS256 / JWT)
        $authHeader = request()->header('Authorization');
        if ($authHeader) {
            $client = $client->withHeaders(['Authorization' => $authHeader]);
        }

        // Propagation des en-têtes vérifiés par l'API Gateway
        if (request()->header('X-Gateway-Auth')) {
            $client = $client->withHeaders([
                'X-Gateway-Auth' => request()->header('X-Gateway-Auth'),
                'X-User-Id' => (string) request()->header('X-User-Id'),
                'X-User-Role' => (string) request()->header('X-User-Role'),
            ]);
        }

        return $client;
    }
}
