<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreatePostRequest;
use App\Http\Requests\UpdatePostRequest;
use App\Http\Resources\PostResource;
use App\Models\Post;
use App\Services\PostService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use OpenApi\Attributes as OA;

class PostController extends Controller
{
    public function __construct(
        protected PostService $postService
    ) {}

    #[OA\Get(
        path: '/api/posts',
        summary: 'Liste paginée des publications et questions',
        description: 'Récupère les publications publiques (non masquées, non supprimées) avec filtres de catégorie, type ou recherche plein texte.',
        tags: ['Posts'],
        parameters: [
            new OA\Parameter(name: 'category', in: 'query', required: false, description: 'Slug ou ID de la catégorie', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'type', in: 'query', required: false, description: 'Type de contenu', schema: new OA\Schema(type: 'string', enum: ['post', 'question'])),
            new OA\Parameter(name: 'search', in: 'query', required: false, description: 'Recherche dans le titre ou le contenu', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'order', in: 'query', required: false, description: 'Tri temporel', schema: new OA\Schema(type: 'string', enum: ['desc', 'asc'], default: 'desc')),
            new OA\Parameter(name: 'page', in: 'query', required: false, description: 'Numéro de page', schema: new OA\Schema(type: 'integer', default: 1)),
        ],
        responses: [
            new OA\Response(
                response: 200,
                description: 'Liste paginée des publications',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', type: 'array', items: new OA\Items(ref: '#/components/schemas/PostResource')),
                        new OA\Property(property: 'links', type: 'object'),
                        new OA\Property(property: 'meta', type: 'object'),
                    ]
                )
            ),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->only(['category', 'type', 'search', 'order']);
        $posts = $this->postService->getPaginated($filters, 15);

        return PostResource::collection($posts);
    }

    #[OA\Post(
        path: '/api/posts',
        summary: 'Créer une publication ou poser une question',
        description: 'Permet à un parent ou professionnel authentifié de créer un nouveau sujet.',
        tags: ['Posts'],
        security: [['bearerAuth' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['category_id', 'type', 'title', 'content'],
                properties: [
                    new OA\Property(property: 'category_id', type: 'integer', example: 1),
                    new OA\Property(property: 'type', type: 'string', enum: ['post', 'question'], example: 'question'),
                    new OA\Property(property: 'title', type: 'string', example: 'Bébé fait ses dents : que conseiller ?'),
                    new OA\Property(property: 'content', type: 'string', example: 'Mon bébé de 6 mois a les gencives douloureuses...'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 201,
                description: 'Publication créée avec succès',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/PostResource'),
                    ]
                )
            ),
            new OA\Response(response: 401, description: 'Non authentifié (JWT absent ou invalide)', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 422, description: 'Erreur de validation', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string'), new OA\Property(property: 'errors', type: 'object')])),
            new OA\Response(response: 429, description: 'Trop de requêtes', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function store(CreatePostRequest $request): JsonResponse
    {
        $authorId = $request->attributes->get('jwt_user_id');
        $post = $this->postService->create($request->validated(), $authorId);

        return (new PostResource($post))
            ->response()
            ->setStatusCode(201);
    }

    #[OA\Get(
        path: '/api/posts/{id}',
        summary: 'Détail d\'une publication avec ses commentaires',
        description: 'Récupère une publication publique spécifique avec tous ses commentaires publiés associés.',
        tags: ['Posts'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, description: 'Identifiant de la publication', schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(
                response: 200,
                description: 'Détails de la publication',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/PostResource'),
                    ]
                )
            ),
            new OA\Response(response: 404, description: 'Publication introuvable ou masquée', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function show(int|string $id): PostResource
    {
        $post = $this->postService->getDetails($id);

        return new PostResource($post);
    }

    #[OA\Put(
        path: '/api/posts/{id}',
        summary: 'Modifier une publication',
        description: 'Seul l\'auteur d\'origine peut mettre à jour sa publication.',
        tags: ['Posts'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, description: 'Identifiant de la publication', schema: new OA\Schema(type: 'integer')),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'category_id', type: 'integer', example: 1),
                    new OA\Property(property: 'type', type: 'string', enum: ['post', 'question'], example: 'question'),
                    new OA\Property(property: 'title', type: 'string', example: 'Titre mis à jour'),
                    new OA\Property(property: 'content', type: 'string', example: 'Nouveau texte complet...'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 200,
                description: 'Publication modifiée',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/PostResource'),
                    ]
                )
            ),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 403, description: 'Action refusée (non-auteur)', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 404, description: 'Publication introuvable', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 422, description: 'Données invalides', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string'), new OA\Property(property: 'errors', type: 'object')])),
        ]
    )]
    public function update(UpdatePostRequest $request, int|string $id): PostResource
    {
        $post = Post::published()->findOrFail($id);
        $userId = $request->attributes->get('jwt_user_id');

        $updated = $this->postService->update($post, $request->validated(), $userId);

        return new PostResource($updated);
    }

    #[OA\Delete(
        path: '/api/posts/{id}',
        summary: 'Supprimer une publication',
        description: 'Seul l\'auteur d\'origine ou un administrateur (ADMIN) peut supprimer la publication.',
        tags: ['Posts'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, description: 'Identifiant de la publication', schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Publication supprimée avec succès', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string', example: 'Publication supprimée avec succès.')])),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 403, description: 'Action refusée (ni auteur ni ADMIN)', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 404, description: 'Publication introuvable', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function destroy(Request $request, int|string $id): JsonResponse
    {
        $post = Post::published()->findOrFail($id);
        $userId = $request->attributes->get('jwt_user_id');
        $userRole = $request->attributes->get('jwt_role');

        $this->postService->delete($post, $userId, $userRole);

        return response()->json([
            'message' => 'Publication supprimée avec succès.',
        ], 200);
    }
}
