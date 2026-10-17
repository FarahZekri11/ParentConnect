<?php

namespace App\Http\Middleware;

use Closure;
use Exception;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\SignatureInvalidException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class JwtAuth
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization');

        if (! $header || ! preg_match('/^Bearer\s+(.*?)$/i', $header, $matches)) {
            return response()->json([
                'message' => 'Token JWT manquant ou non fourni dans l\'en-tête Authorization.',
            ], 401);
        }

        $token = $matches[1];
        $secret = config('app.jwt_secret') ?? env('JWT_SECRET');

        if (! $secret) {
            return response()->json([
                'message' => 'Clé JWT non configurée sur le serveur.',
            ], 500);
        }

        try {
            $decoded = JWT::decode($token, new Key($secret, 'HS256'));
        } catch (ExpiredException $e) {
            return response()->json([
                'message' => 'Le token JWT a expiré.',
            ], 401);
        } catch (SignatureInvalidException $e) {
            return response()->json([
                'message' => 'Signature du token JWT invalide.',
            ], 401);
        } catch (Exception $e) {
            return response()->json([
                'message' => 'Token JWT invalide : ' . $e->getMessage(),
            ], 401);
        }

        $userId = $decoded->sub ?? $decoded->user_id ?? null;
        if (! $userId) {
            return response()->json([
                'message' => 'Identifiant utilisateur (sub) absent du token JWT.',
            ], 401);
        }

        $role = strtoupper($decoded->role ?? 'PARENT');

        $request->attributes->set('jwt_user_id', (string) $userId);
        $request->attributes->set('jwt_role', $role);
        $request->attributes->set('jwt_payload', (array) $decoded);

        return $next($request);
    }
}
