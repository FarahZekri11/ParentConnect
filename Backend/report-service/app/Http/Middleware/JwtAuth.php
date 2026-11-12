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

/**
 * Middleware d'authentification JWT — compatible Keycloak (RS256) et tokens custom (HS256).
 *
 * Priorité d'authentification :
 *   1. Bearer <token>  → validation par signature (RS256 Keycloak ou HS256 custom)
 *   2. X-Gateway-Auth: verified + X-User-Id  → requête déjà validée par le Gateway
 *   3. Aucune identité → 401 Unauthorized
 */
class JwtAuth
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $header       = $request->header('Authorization');
        $gatewayAuth  = $request->header('X-Gateway-Auth');
        $gatewayUserId = $request->header('X-User-Id');
        $gatewayUserRole = $request->header('X-User-Role');

        // ─────────────────────────────────────────────────────────────
        // Cas 1 : Token JWT fourni directement dans Authorization
        // ─────────────────────────────────────────────────────────────
        if ($header && preg_match('/^Bearer\s+(.*?)$/i', $header, $matches)) {
            $token = $matches[1];

            // Lire l'algorithme depuis l'en-tête JWT (sans valider la signature)
            $alg = $this->peekAlgorithm($token);

            if ($alg === 'RS256') {
                // ── Validation Keycloak RS256 ──
                return $this->handleRs256($token, $request, $next);
            } else {
                // ── Validation custom HS256 ──
                return $this->handleHs256($token, $request, $next);
            }
        }

        // ─────────────────────────────────────────────────────────────
        // Cas 2 : Requête relayée et pré-validée par l'API Gateway
        //         L'en-tête X-Gateway-Auth: verified garantit que le
        //         Gateway a déjà vérifié le token avant de transmettre.
        // ─────────────────────────────────────────────────────────────
        if ($gatewayAuth === 'verified' && ! empty($gatewayUserId)) {
            $role = strtoupper($gatewayUserRole ?: 'PARENT');
            $request->attributes->set('jwt_user_id', (string) $gatewayUserId);
            $request->attributes->set('jwt_role',    $role);
            $request->attributes->set('jwt_payload', [
                'sub'  => (string) $gatewayUserId,
                'role' => $role,
                'name' => $request->header('X-User-Name', ''),
            ]);

            return $next($request);
        }

        // ─────────────────────────────────────────────────────────────
        // Cas 3 : Aucun token ni identité vérifiée → 401
        // ─────────────────────────────────────────────────────────────
        return response()->json([
            'status'  => 401,
            'error'   => 'Unauthorized',
            'message' => 'Token JWT manquant. Fournissez un Bearer token Keycloak ou un token custom.',
        ], 401);
    }

    // ─────────────────────────────────────────────────────────────────
    // Validation Keycloak RS256
    // ─────────────────────────────────────────────────────────────────
    private function handleRs256(string $token, Request $request, Closure $next): Response
    {
        $publicKeyBase64 = env('KEYCLOAK_REALM_PUBLIC_KEY', '');

        if (empty($publicKeyBase64)) {
            return response()->json([
                'status'  => 500,
                'error'   => 'Internal Server Error',
                'message' => 'Clé publique Keycloak (KEYCLOAK_REALM_PUBLIC_KEY) non configurée.',
            ], 500);
        }

        // Convertir la clé base64 DER → PEM
        $pem = "-----BEGIN PUBLIC KEY-----\n"
             . wordwrap($publicKeyBase64, 64, "\n", true)
             . "\n-----END PUBLIC KEY-----";

        try {
            $decoded = JWT::decode($token, new Key($pem, 'RS256'));
        } catch (ExpiredException $e) {
            return response()->json([
                'status'  => 401,
                'error'   => 'Unauthorized',
                'message' => 'Token Keycloak expiré. Reconnectez-vous pour obtenir un nouveau token.',
            ], 401);
        } catch (SignatureInvalidException $e) {
            return response()->json([
                'status'  => 401,
                'error'   => 'Unauthorized',
                'message' => 'Signature du token Keycloak invalide.',
            ], 401);
        } catch (Exception $e) {
            return response()->json([
                'status'  => 401,
                'error'   => 'Unauthorized',
                'message' => 'Token Keycloak invalide : ' . $e->getMessage(),
            ], 401);
        }

        // Extraire l'identité depuis les claims Keycloak : "sub" (identifiant stable, identique à X-User-Id
        // transmis par l'API Gateway), "preferred_username" seulement en repli
        $userId = $decoded->sub
               ?? $decoded->preferred_username
               ?? null;

        if (! $userId) {
            return response()->json([
                'status'  => 401,
                'error'   => 'Unauthorized',
                'message' => 'Identifiant utilisateur absent du token Keycloak.',
            ], 401);
        }

        // Extraire le rôle depuis realm_access.roles (format Keycloak)
        $role = $this->extractKeycloakRole($decoded);

        $request->attributes->set('jwt_user_id', (string) $userId);
        $request->attributes->set('jwt_role',    $role);
        $request->attributes->set('jwt_payload', (array) $decoded);

        return $next($request);
    }

    // ─────────────────────────────────────────────────────────────────
    // Validation custom HS256 (tokens legacy ou émis par user-service)
    // ─────────────────────────────────────────────────────────────────
    private function handleHs256(string $token, Request $request, Closure $next): Response
    {
        $secret = env('JWT_SECRET');

        if (! $secret) {
            return response()->json([
                'status'  => 500,
                'error'   => 'Internal Server Error',
                'message' => 'Clé JWT (JWT_SECRET) non configurée sur le serveur.',
            ], 500);
        }

        try {
            $decoded = JWT::decode($token, new Key($secret, 'HS256'));
        } catch (ExpiredException $e) {
            return response()->json([
                'status'  => 401,
                'error'   => 'Unauthorized',
                'message' => 'Le token JWT a expiré.',
            ], 401);
        } catch (SignatureInvalidException $e) {
            return response()->json([
                'status'  => 401,
                'error'   => 'Unauthorized',
                'message' => 'Signature du token JWT invalide.',
            ], 401);
        } catch (Exception $e) {
            return response()->json([
                'status'  => 401,
                'error'   => 'Unauthorized',
                'message' => 'Token JWT invalide : ' . $e->getMessage(),
            ], 401);
        }

        $userId = $decoded->sub ?? $decoded->user_id ?? null;
        if (! $userId) {
            return response()->json([
                'status'  => 401,
                'error'   => 'Unauthorized',
                'message' => 'Identifiant utilisateur (sub) absent du token JWT.',
            ], 401);
        }

        $role = strtoupper($decoded->role ?? 'PARENT');

        $request->attributes->set('jwt_user_id', (string) $userId);
        $request->attributes->set('jwt_role',    $role);
        $request->attributes->set('jwt_payload', (array) $decoded);

        return $next($request);
    }

    // ─────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────

    /**
     * Lire l'algorithme depuis l'en-tête JWT (sans vérifier la signature).
     */
    private function peekAlgorithm(string $token): string
    {
        try {
            $parts = explode('.', $token);
            if (count($parts) < 1) {
                return 'HS256';
            }
            $headerJson = base64_decode(str_pad(
                strtr($parts[0], '-_', '+/'),
                strlen($parts[0]) % 4 === 0 ? strlen($parts[0]) : strlen($parts[0]) + 4 - strlen($parts[0]) % 4,
                '='
            ));
            $header = json_decode($headerJson, true);
            return $header['alg'] ?? 'HS256';
        } catch (Exception $e) {
            return 'HS256';
        }
    }

    /**
     * Extraire le rôle depuis un token Keycloak décodé.
     * Priorité : realm_access.roles → resource_access.<client>.roles → claim 'role'
     */
    private function extractKeycloakRole(object $decoded): string
    {
        // Rôles métier reconnus, du plus élevé au plus faible
        $priority = ['ADMIN', 'PROFESSIONAL', 'BABYSITTER', 'PARENT'];
        $found = [];

        // Format Keycloak : realm_access.roles
        if (isset($decoded->realm_access->roles) && is_array($decoded->realm_access->roles)) {
            foreach ($decoded->realm_access->roles as $r) {
                $found[] = strtoupper($r);
            }
        }

        // Format Keycloak : resource_access.<client>.roles
        if (isset($decoded->resource_access) && is_object($decoded->resource_access)) {
            foreach ((array) $decoded->resource_access as $clientRoles) {
                if (isset($clientRoles->roles) && is_array($clientRoles->roles)) {
                    foreach ($clientRoles->roles as $r) {
                        $found[] = strtoupper($r);
                    }
                }
            }
        }

        foreach ($priority as $role) {
            if (in_array($role, $found, true)) {
                return $role;
            }
        }

        // Fallback : claim 'role' simple
        if (isset($decoded->role)) {
            return strtoupper($decoded->role);
        }

        return 'PARENT';
    }
}
