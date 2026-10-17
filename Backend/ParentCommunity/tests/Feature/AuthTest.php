<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Feriel Benali',
            'email' => 'feriel.new@parentconnect.fr',
            'password' => 'secretPass123',
            'role' => 'PARENT',
            'phone' => '+33612345678',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('user.email', 'feriel.new@parentconnect.fr')
            ->assertJsonPath('user.name', 'Feriel Benali')
            ->assertJsonPath('user.role', 'PARENT')
            ->assertJsonStructure(['user', 'token_type', 'access_token', 'authorization_header']);

        $this->assertDatabaseHas('users', [
            'email' => 'feriel.new@parentconnect.fr',
            'role' => 'PARENT',
        ]);
    }

    public function test_registration_fails_if_email_already_exists(): void
    {
        User::factory()->create(['email' => 'existing@parentconnect.fr']);

        $response = $this->postJson('/api/auth/register', [
            'name' => 'Autre Utilisateur',
            'email' => 'existing@parentconnect.fr',
            'password' => 'monMotDePasse123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_user_can_login_with_valid_credentials(): void
    {
        $user = User::factory()->create([
            'email' => 'login.test@parentconnect.fr',
            'password' => Hash::make('secretPassword'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'login.test@parentconnect.fr',
            'password' => 'secretPassword',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonStructure(['user', 'access_token', 'authorization_header']);
    }

    public function test_login_fails_with_invalid_credentials(): void
    {
        User::factory()->create([
            'email' => 'bad.creds@parentconnect.fr',
            'password' => Hash::make('correctPassword'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'bad.creds@parentconnect.fr',
            'password' => 'wrongPassword',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_authenticated_user_can_view_own_profile(): void
    {
        $user = User::factory()->create([
            'name' => 'Sophie Profil',
            'email' => 'sophie@parentconnect.fr',
        ]);

        $response = $this->withJwt((string) $user->id, 'PARENT')
            ->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.name', 'Sophie Profil');
    }

    public function test_admin_can_list_users(): void
    {
        User::factory()->count(3)->create();

        $response = $this->withJwt('admin_root', 'ADMIN')
            ->getJson('/api/users');

        $response->assertStatus(200)
            ->assertJsonStructure(['data', 'meta']);
    }

    public function test_non_admin_cannot_list_users(): void
    {
        $response = $this->withJwt('parent_normal', 'PARENT')
            ->getJson('/api/users');

        $response->assertStatus(403);
    }

    public function test_can_view_public_user_profile(): void
    {
        $user = User::factory()->create([
            'name' => 'Marc Dupont',
        ]);

        $response = $this->getJson("/api/users/{$user->id}");

        $response->assertStatus(200)
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.name', 'Marc Dupont');
    }
}
