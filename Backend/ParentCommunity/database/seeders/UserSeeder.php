<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        // Utilisateur Parent (Feriel)
        User::firstOrCreate(
            ['email' => 'feriel@parentconnect.fr'],
            [
                'name' => 'Feriel',
                'password' => Hash::make('password123'),
                'role' => User::ROLE_PARENT,
                'phone' => '+33612345678',
            ]
        );

        // Administrateur
        User::firstOrCreate(
            ['email' => 'admin@parentconnect.fr'],
            [
                'name' => 'Administrateur',
                'password' => Hash::make('admin123'),
                'role' => User::ROLE_ADMIN,
                'phone' => '+33600000000',
            ]
        );

        // Professionnel de santé
        User::firstOrCreate(
            ['email' => 'dr.claire@parentconnect.fr'],
            [
                'name' => 'Dr. Claire Martin',
                'password' => Hash::make('password123'),
                'role' => User::ROLE_PROFESSIONAL,
                'phone' => '+33698765432',
            ]
        );
    }
}
