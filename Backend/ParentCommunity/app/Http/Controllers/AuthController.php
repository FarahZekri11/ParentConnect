<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use OpenApi\Attributes as OA;

class AuthController extends Controller
{
    private function generateJwtForUser(User|array $user): array
    {
        $userId = is_array($user) ? $user['id'] : (string) $user->id;
        $role = is_array($user) ? $user['role'] : $user->role;
        $name = is_array($user) ? $user['name'] : $user->name;

        $secret = config('app.jwt_secret') ?? env('JWT_SECRET');
        $ttl = 365 * 24 * 3600; // Valide 1 an

        $payload = [
            'sub' => (string) $userId,
            'role' => strtoupper($role),
            'name' => $name,
            'iat' => time(),
            'exp' => time() + $ttl,
        ];

        $token = JWT::encode($payload, $secret, 'HS256');

        return [
            'token_type' => 'Bearer',
            'access_token' => $token,
            'expires_in' => $ttl,
            'authorization_header' => 'Bearer ' . $token,
        ];
    }

    #[OA\Post(
        path: '/api/auth/register',
        summary: 'Inscription d\'un nouvel utilisateur',
        description: 'Crée un compte utilisateur et génère immédiatement son token JWT Bearer pour Swagger.',
        tags: ['Authentication'],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name', 'email', 'password'],
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'Feriel Benali'),
                    new OA\Property(property: 'email', type: 'string', example: 'feriel.benali@parentconnect.fr'),
                    new OA\Property(property: 'password', type: 'string', format: 'password', example: 'monSecret123'),
                    new OA\Property(property: 'role', type: 'string', enum: ['PARENT', 'PROFESSIONAL', 'ADMIN'], example: 'PARENT'),
                    new OA\Property(property: 'phone', type: 'string', example: '+33612345678'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 201,
                description: 'Compte créé avec succès',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'user', ref: '#/components/schemas/UserResource'),
                        new OA\Property(property: 'token_type', type: 'string', example: 'Bearer'),
                        new OA\Property(property: 'access_token', type: 'string', example: 'eyJ0eXAi...'),
                        new OA\Property(property: 'authorization_header', type: 'string', example: 'Bearer eyJ0eXAi...'),
                        new OA\Property(property: 'swagger_instruction', type: 'string', example: 'Collez la valeur dans le bouton Authorize de Swagger.'),
                    ]
                )
            ),
            new OA\Response(response: 422, description: 'Erreur de validation (ex: email déjà pris)', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string'), new OA\Property(property: 'errors', type: 'object')])),
        ]
    )]
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'role' => ['sometimes', 'string', Rule::in(['PARENT', 'PROFESSIONAL', 'ADMIN', 'parent', 'professional', 'admin'])],
            'phone' => ['nullable', 'string', 'max:30'],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => strtolower($validated['email']),
            'password' => $validated['password'],
            'role' => strtoupper($validated['role'] ?? User::ROLE_PARENT),
            'phone' => $validated['phone'] ?? null,
        ]);

        $tokenData = $this->generateJwtForUser($user);

        return response()->json([
            'user' => new UserResource($user),
            'token_type' => $tokenData['token_type'],
            'access_token' => $tokenData['access_token'],
            'authorization_header' => $tokenData['authorization_header'],
            'swagger_instruction' => 'Copiez la valeur de authorization_header et collez-la dans le bouton Authorize de Swagger.',
        ], 201);
    }

    #[OA\Post(
        path: '/api/auth/login',
        summary: 'Connexion d\'un utilisateur',
        description: 'Vérifie les identifiants et retourne le token JWT Bearer pour s\'authentifier dans Swagger.',
        tags: ['Authentication'],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['email', 'password'],
                properties: [
                    new OA\Property(property: 'email', type: 'string', example: 'feriel@parentconnect.fr'),
                    new OA\Property(property: 'password', type: 'string', format: 'password', example: 'password123'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 200,
                description: 'Connexion réussie',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'user', ref: '#/components/schemas/UserResource'),
                        new OA\Property(property: 'token_type', type: 'string', example: 'Bearer'),
                        new OA\Property(property: 'access_token', type: 'string', example: 'eyJ0eXAi...'),
                        new OA\Property(property: 'authorization_header', type: 'string', example: 'Bearer eyJ0eXAi...'),
                    ]
                )
            ),
            new OA\Response(response: 422, description: 'Identifiants invalides', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', strtolower($credentials['email']))->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Identifiants incorrects. Veuillez vérifier votre adresse email et votre mot de passe.'],
            ]);
        }

        $tokenData = $this->generateJwtForUser($user);

        return response()->json([
            'user' => new UserResource($user),
            'token_type' => $tokenData['token_type'],
            'access_token' => $tokenData['access_token'],
            'authorization_header' => $tokenData['authorization_header'],
            'swagger_instruction' => 'Copiez la valeur de authorization_header et collez-la dans le bouton Authorize de Swagger.',
        ]);
    }

    #[OA\Get(
        path: '/api/auth/me',
        summary: 'Profil de l\'utilisateur connecté',
        description: 'Récupère les informations du profil rattaché au token JWT actif.',
        tags: ['Authentication'],
        security: [['bearerAuth' => []]],
        responses: [
            new OA\Response(
                response: 200,
                description: 'Profil de l\'utilisateur connecté',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'data', ref: '#/components/schemas/UserResource'),
                    ]
                )
            ),
            new OA\Response(response: 401, description: 'Non authentifié', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
        ]
    )]
    public function me(Request $request): JsonResponse
    {
        $userId = $request->attributes->get('jwt_user_id');

        $user = is_numeric($userId) ? User::find($userId) : null;

        if ($user) {
            return (new UserResource($user))->response();
        }

        // Si l'utilisateur n'est pas dans la table locale mais dans le token (ex: sous-jacent Spring Boot)
        return response()->json([
            'data' => [
                'id' => $userId,
                'name' => $request->attributes->get('jwt_payload')['name'] ?? 'Utilisateur',
                'role' => $request->attributes->get('jwt_role'),
                'is_external_identity' => true,
            ],
        ]);
    }

    #[OA\Post(
        path: '/api/auth/token',
        summary: 'Générateur rapide de token JWT (Sans mot de passe)',
        description: 'Outil pratique pour tester directement dans Swagger sans créer de mot de passe.',
        tags: ['Authentication'],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['user_id', 'role'],
                properties: [
                    new OA\Property(property: 'user_id', type: 'string', example: 'feriel'),
                    new OA\Property(property: 'role', type: 'string', enum: ['PARENT', 'PROFESSIONAL', 'ADMIN'], example: 'PARENT'),
                ]
            )
        ),
        responses: [
            new OA\Response(
                response: 200,
                description: 'Token JWT généré',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'token_type', type: 'string', example: 'Bearer'),
                        new OA\Property(property: 'access_token', type: 'string'),
                        new OA\Property(property: 'authorization_header', type: 'string'),
                    ]
                )
            ),
        ]
    )]
    public function generateToken(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'string', 'min:1'],
            'role' => ['required', 'string', Rule::in(['PARENT', 'PROFESSIONAL', 'ADMIN', 'parent', 'professional', 'admin'])],
        ]);

        $tokenData = $this->generateJwtForUser([
            'id' => $validated['user_id'],
            'role' => $validated['role'],
            'name' => ucfirst($validated['user_id']),
        ]);

        return response()->json([
            'user_id' => $validated['user_id'],
            'role' => strtoupper($validated['role']),
            'token_type' => $tokenData['token_type'],
            'access_token' => $tokenData['access_token'],
            'authorization_header' => $tokenData['authorization_header'],
            'swagger_instruction' => 'Copiez la valeur de authorization_header et collez-la dans le bouton Authorize de Swagger.',
        ]);
    }
}
