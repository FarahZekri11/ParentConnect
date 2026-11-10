<?php

namespace Tests;

use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Generate a valid or custom JWT token for testing.
     */
    protected function generateJwt(
        string $userId = 'user_test_123',
        string $role = 'PARENT',
        int $ttl = 3600,
        ?string $secret = null
    ): string {
        $secret = $secret ?? env('JWT_SECRET', 'testing_jwt_secret_key_32_characters_long_min');

        $payload = [
            'sub' => $userId,
            'role' => $role,
            'iat' => time(),
            'exp' => time() + $ttl,
        ];

        return JWT::encode($payload, $secret, 'HS256');
    }

    /**
     * Set the Authorization Bearer header with a generated JWT.
     */
    protected function withJwt(string $userId = 'user_test_123', string $role = 'PARENT'): static
    {
        $token = $this->generateJwt($userId, $role);

        return $this->withHeader('Authorization', 'Bearer ' . $token);
    }
}
