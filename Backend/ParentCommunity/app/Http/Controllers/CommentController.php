<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreateCommentRequest;
use App\Http\Resources\CommentResource;
use App\Models\Post;
use App\Services\CommentService;
use Illuminate\Http\JsonResponse;
use OpenApi\Attributes as OA;

class CommentController extends Controller
{
    public function __construct(
        protected CommentService $commentService
    ) {}

    #[OA\Post(
        path: '/api/posts/{id}/comments',
        summary: 'Ajouter un commentaire à une publication',
        description: 'Permet à un utilisateur authentifié d\'ajouter une réponse ou un commentaire à un post/question existant.',
        tags: ['Comments'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, description: 'Identifiant de la publication', schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['content'],
                properties: [
                    new OA\Property(property: 'content', type: 'string', example: 'Je te conseille un anneau de dentition réfrigéré, cela a fait des miracles pour mon petit !'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 201,
                description: 'Commentaire créé avec succès',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/CommentResource'),
                    ]
                )
            ),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 404, description: 'Publication introuvable', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 422, description: 'Erreur de validation', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string'), new OA\Property(property: 'errors', type: 'object')])),
            new OA\Response(response: 429, description: 'Trop de requêtes', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function store(CreateCommentRequest $request, int|string $id): JsonResponse
    {
        $post = Post::published()->findOrFail($id);
        $authorId = $request->attributes->get('jwt_user_id');

        $comment = $this->commentService->addComment($post, $request->validated(), $authorId);

        return (new CommentResource($comment))
            ->response()
            ->setStatusCode(201);
    }
}
