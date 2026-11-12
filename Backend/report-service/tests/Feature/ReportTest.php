<?php

namespace Tests\Feature;

use App\Models\Report;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_report(): void
    {
        $response = $this->postJson('/api/posts/1/report', [
            'reason' => 'Spam',
        ]);

        $response->assertStatus(401);
    }

    public function test_authenticated_user_can_report_post(): void
    {
        $response = $this->withJwt('parent_user_1', 'PARENT')
            ->postJson('/api/posts/1/report', [
                'reason' => 'Contenu inapproprié',
                'details' => 'Détails du signalement.',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.target_type', 'post')
            ->assertJsonPath('data.target_id', 1);

        $this->assertDatabaseHas('reports', [
            'reporter_id' => 'parent_user_1',
            'target_type' => 'post',
            'target_id' => 1,
        ]);
    }

    public function test_user_cannot_report_same_post_twice(): void
    {
        Report::factory()->create([
            'reporter_id' => 'parent_user_1',
            'target_type' => 'post',
            'target_id' => 1,
        ]);

        $response = $this->withJwt('parent_user_1', 'PARENT')
            ->postJson('/api/posts/1/report', [
                'reason' => 'Deuxième signalement',
            ]);

        $response->assertStatus(400);
    }
}
