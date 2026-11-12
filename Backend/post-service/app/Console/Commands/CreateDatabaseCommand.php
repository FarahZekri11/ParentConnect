<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use PDO;

class CreateDatabaseCommand extends Command
{
    protected $signature = 'db:create {--fresh : Réinitialise et re-crée toutes les tables avec les seeders}';

    protected $description = 'Crée la base de données PostgreSQL community_db et applique les migrations';

    public function handle(): int
    {
        $host = env('DB_HOST', '127.0.0.1');
        $port = env('DB_PORT', '5432');
        $dbName = env('DB_DATABASE', 'community_db');
        $username = env('DB_USERNAME', 'postgres');
        $password = env('DB_PASSWORD', '1234');

        $this->info("Connexion au serveur PostgreSQL ({$host}:{$port})...");

        try {
            // Connexion au serveur postgres générique
            $pdo = new PDO("pgsql:host={$host};port={$port};dbname=postgres", $username, $password);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Vérifie si la base existe
            $stmt = $pdo->prepare("SELECT 1 FROM pg_database WHERE datname = :dbname");
            $stmt->execute(['dbname' => $dbName]);
            $exists = $stmt->fetchColumn();

            if (! $exists) {
                $this->info("Création de la base de données {$dbName}...");
                $pdo->exec("CREATE DATABASE \"{$dbName}\"");
                $this->info("Base de données [{$dbName}] créée avec succès !");
            } else {
                $this->info("La base de données [{$dbName}] existe déjà.");
            }
        } catch (\Throwable $e) {
            $this->error("Erreur de connexion PostgreSQL : " . $e->getMessage());
            return Command::FAILURE;
        }

        // Lancer les migrations
        $this->info("Application des migrations et des seeders...");
        if ($this->option('fresh')) {
            $this->call('migrate:fresh', ['--seed' => true]);
        } else {
            $this->call('migrate', ['--seed' => true]);
        }

        $this->info("Base de données [{$dbName}] prête à l'emploi avec PostgreSQL !");

        return Command::SUCCESS;
    }
}
