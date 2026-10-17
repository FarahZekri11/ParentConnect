<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreateReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Comment;
use App\Models\Post;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use OpenApi\Attributes as OA;

class ReportController extends Controller
{
    public function __construct(
        protected ReportService $reportService
    ) {}

    #[OA\Post(
        path: '/api/posts/{id}/report',
        summary: 'Signaler une publication',
        description: 'Permet à un utilisateur authentifié de signaler une publication inappropriée. Un utilisateur ne peut pas signaler deux fois le même contenu.',
        tags: ['Reports'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, description: 'Identifiant de la publication à signaler', schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['reason'],
                properties: [
                    new OA\Property(property: 'reason', type: 'string', example: 'Contenu publicitaire non sollicité'),
                    new OA\Property(property: 'details', type: 'string', example: 'Cet utilisateur vend des produits non autorisés sur le fil.'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 201,
                description: 'Signalement enregistré avec succès',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/ReportResource'),
                    ]
                )
            ),
            new OA\Response(response: 400, description: 'L\'utilisateur a déjà signalé ce contenu', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 404, description: 'Publication introuvable', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 422, description: 'Erreur de validation', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string'), new OA\Property(property: 'errors', type: 'object')])),
            new OA\Response(response: 429, description: 'Trop de requêtes', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function reportPost(CreateReportRequest $request, int|string $id): JsonResponse
    {
        $post = Post::published()->findOrFail($id);
        $reporterId = $request->attributes->get('jwt_user_id');

        $report = $this->reportService->reportPost($post, $request->validated(), $reporterId);

        return (new ReportResource($report))
            ->response()
            ->setStatusCode(201);
    }

    #[OA\Post(
        path: '/api/comments/{id}/report',
        summary: 'Signaler un commentaire',
        description: 'Permet à un utilisateur authentifié de signaler un commentaire offensant ou spam. Un utilisateur ne peut pas signaler deux fois le même contenu.',
        tags: ['Reports'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, description: 'Identifiant du commentaire à signaler', schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['reason'],
                properties: [
                    new OA\Property(property: 'reason', type: 'string', example: 'Propos agressifs ou irrespectueux'),
                    new OA\Property(property: 'details', type: 'string', example: 'Attaque personnelle dans la réponse.'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 201,
                description: 'Signalement enregistré avec succès',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/ReportResource'),
                    ]
                )
            ),
            new OA\Response(response: 400, description: 'L\'utilisateur a déjà signalé ce commentaire', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 404, description: 'Commentaire introuvable', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 422, description: 'Erreur de validation', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string'), new OA\Property(property: 'errors', type: 'object')])),
            new OA\Response(response: 429, description: 'Trop de requêtes', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function reportComment(CreateReportRequest $request, int|string $id): JsonResponse
    {
        $comment = Comment::published()->findOrFail($id);
        $reporterId = $request->attributes->get('jwt_user_id');

        $report = $this->reportService->reportComment($comment, $request->validated(), $reporterId);

        return (new ReportResource($report))
            ->response()
            ->setStatusCode(201);
    }
}
