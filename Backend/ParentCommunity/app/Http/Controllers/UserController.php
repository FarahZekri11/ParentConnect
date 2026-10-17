<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use OpenApi\Attributes as OA;

class UserController extends Controller
{
    #[OA\Get(
        path: '/api/users',
        summary: 'Liste des utilisateurs (ADMIN)',
        description: 'Permet aux administrateurs de lister tous les utilisateurs inscrits sur la plateforme.',
        tags: ['Users'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(name: 'role', in: 'query', required: false, description: 'Filtrer par rôle', schema: new OA\Schema(type: 'string', enum: ['PARENT', 'PROFESSIONAL', 'ADMIN'])),
            new OA\Parameter(name: 'page', in: 'query', required: false, schema: new OA\Schema(type: 'integer', default: 1)),
        ],
        responses: [
            new OA\Response(
                response: 200,
                description: 'Liste paginée des utilisateurs',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', type: 'array', items: new OA\Items(ref: '#/components/schemas/UserResource')),
                        new OA\Property(property: 'meta', type: 'object'),
                    ]
                )
            ),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 403, description: 'Accès interdit (ADMIN requis)', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = User::query();

        if ($role = $request->query('role')) {
            $query->where('role', strtoupper($role));
        }

        return UserResource::collection($query->paginate(20));
    }

    #[OA\Get(
        path: '/api/users/{id}',
        summary: 'Détail d\'un utilisateur',
        description: 'Récupère les informations publiques d\'un profil utilisateur.',
        tags: ['Users'],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(
                response: 200,
                description: 'Profil utilisateur',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/UserResource'),
                    ]
                )
            ),
            new OA\Response(response: 404, description: 'Utilisateur introuvable', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function show(int|string $id): UserResource
    {
        $user = User::findOrFail($id);

        return new UserResource($user);
    }
}
