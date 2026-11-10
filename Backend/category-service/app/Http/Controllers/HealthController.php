<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;

class HealthController extends Controller
{
    #[OA\Get(
        path: '/api/health',
        summary: 'Vérification de l\'état de santé du service',
        description: 'Healthcheck public sans authentification utilisé par Kubernetes / Docker / API Gateway.',
        tags: ['Health'],
        responses: [
            new OA\Response(
                response: 200,
                description: 'Service opérationnel',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'status', type: 'string', example: 'UP'),
                        new OA\Property(property: 'service', type: 'string', example: 'community-service'),
                        new OA\Property(property: 'database', type: 'string', example: 'connected'),
                        new OA\Property(property: 'timestamp', type: 'string', example: '2026-10-15T18:00:00Z'),
                    ]
                )
            ),
        ]
    )]
    public function __invoke(): JsonResponse
    {
        $dbStatus = 'connected';
        try {
            DB::connection()->getPdo();
        } catch (\Throwable $e) {
            $dbStatus = 'disconnected';
        }

        return response()->json([
            'status' => 'UP',
            'service' => 'community-service',
            'database' => $dbStatus,
            'timestamp' => now()->toIso8601String(),
        ]);
    }
}
