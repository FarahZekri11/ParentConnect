<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $userRole = $request->attributes->get('jwt_role');

        if (! $userRole) {
            return response()->json([
                'message' => 'Authentification requise pour vérifier le rôle.',
            ], 401);
        }

        $allowedRoles = array_map('strtoupper', $roles);

        if (! in_array(strtoupper($userRole), $allowedRoles, true)) {
            return response()->json([
                'message' => 'Accès interdit : privilèges insuffisants pour cette action.',
            ], 403);
        }

        return $next($request);
    }
}
