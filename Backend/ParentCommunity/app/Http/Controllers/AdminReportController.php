<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReviewReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use App\Services\ReportService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use OpenApi\Attributes as OA;

class AdminReportController extends Controller
{
    public function __construct(
        protected ReportService $reportService
    ) {}

    #[OA\Get(
        path: '/api/admin/reports',
        summary: 'Liste des signalements pour modération (ADMIN)',
        description: 'Permet aux administrateurs de consulter la file des signalements (en attente, examinés ou rejetés).',
        tags: ['Admin - Reports'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, description: 'Statut du signalement', schema: new OA\Schema(type: 'string', enum: ['pending', 'reviewed', 'rejected'], default: 'pending')),
            new OA\Parameter(name: 'page', in: 'query', required: false, description: 'Numéro de page', schema: new OA\Schema(type: 'integer', default: 1)),
        ],
        responses: [
            new OA\Response(
                response: 200,
                description: 'Liste des signalements',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', type: 'array', items: new OA\Items(ref: '#/components/schemas/ReportResource')),
                        new OA\Property(property: 'meta', type: 'object'),
                    ]
                )
            ),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 403, description: 'Accès interdit (Rôle ADMIN requis)', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $status = $request->query('status');
        $reports = $this->reportService->getAdminReports($status, 20);

        return ReportResource::collection($reports);
    }

    #[OA\Patch(
        path: '/api/admin/reports/{id}',
        summary: 'Traiter un signalement (ADMIN)',
        description: 'Permet à l\'administrateur de masquer le contenu signalé ou de rejeter le signalement.',
        tags: ['Admin - Reports'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, description: 'Identifiant du signalement', schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['action'],
                properties: [
                    new OA\Property(
                        property: 'action',
                        type: 'string',
                        enum: ['hide_content', 'reject'],
                        example: 'hide_content',
                        description: 'Action : "hide_content" pour masquer le contenu ou "reject" pour rejeter le signalement'
                    ),
                    new OA\Property(property: 'notes', type: 'string', example: 'Contenu publicitaire masqué par admin'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 200,
                description: 'Signalement traité avec succès',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/ReportResource'),
                    ]
                )
            ),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 403, description: 'Accès interdit (Rôle ADMIN requis)', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 404, description: 'Signalement introuvable', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 422, description: 'Erreur de validation', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string'), new OA\Property(property: 'errors', type: 'object')])),
        ]
    )]
    public function update(ReviewReportRequest $request, int|string $id): ReportResource
    {
        $report = Report::findOrFail($id);
        $adminId = $request->attributes->get('jwt_user_id');
        $action = $request->validated('action');

        $updated = $this->reportService->reviewReport($report, $action, $adminId);

        return new ReportResource($updated);
    }
}
