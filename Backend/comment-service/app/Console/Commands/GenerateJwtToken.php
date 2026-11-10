<?php

namespace App\Console\Commands;

use Firebase\JWT\JWT;
use Illuminate\Console\Command;

class GenerateJwtToken extends Command
{
    protected $signature = 'make:jwt {role=PARENT : Le rôle (PARENT, PROFESSIONAL, ADMIN)} {userId=user_parent_01 : L\'identifiant utilisateur (sub)}';

    protected $description = 'Génère un token JWT valide pour tester l\'API dans Swagger UI';

    public function handle(): int
    {
        $role = strtoupper($this->argument('role'));
        $userId = $this->argument('userId');
        $secret = env('JWT_SECRET');

        if (! $secret) {
            $this->error('JWT_SECRET n\'est pas configuré dans le fichier .env !');
            return Command::FAILURE;
        }

        $payload = [
            'sub' => $userId,
            'role' => $role,
            'name' => 'Utilisateur ' . ucfirst(strtolower($role)),
            'iat' => time(),
            'exp' => time() + (365 * 24 * 3600), // Valide 1 an
        ];

        $jwt = JWT::encode($payload, $secret, 'HS256');

        $this->info("=== Token JWT pour Swagger UI ===");
        $this->line("Utilisateur (sub) : <comment>{$userId}</comment>");
        $this->line("Rôle : <comment>{$role}</comment>");
        $this->line("Token : <info>{$jwt}</info>");
        $this->newLine();
        $this->line("Dans Swagger UI, cliquez sur 'Authorize' et entrez : <info>Bearer {$jwt}</info>");

        return Command::SUCCESS;
    }
}
