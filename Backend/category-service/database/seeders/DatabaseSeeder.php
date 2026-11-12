<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Point d'entrée de `php artisan db:seed` (utilisé par AUTO_SEED=true au démarrage du conteneur).
 * CategorySeeder est idempotent (firstOrCreate par slug) : relancé à chaque démarrage sans doublon.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(CategorySeeder::class);
    }
}
