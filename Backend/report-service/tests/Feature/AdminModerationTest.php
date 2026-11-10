<?php

namespace Tests\Feature;

use App\Models\Report;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminModerationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_access_admin_reports(): void
    {
        $response = $this->getJson('/api/admin/reports');
        $response->assertStatus(401);
    }

    public function test_non_admin_cannot_access_admin_reports(): void
    {
        $response = $this->withJwt('parent_user', 'PARENT')->getJson('/api/admin/reports');
        $response->assertStatus(403);
    }

    public function test_admin_can_list_reports(): void
    {
        Report::factory()->count(3)->create(['status' => Report::STATUS_PENDING]);

        $response = $this->withJwt('admin_user', 'ADMIN')->getJson('/api/admin/reports');

        $response->assertStatus(200)
            ->assertJsonCount(3, 'data');
    }

    public function test_admin_can_resolve_report(): void
    {
        $report = Report::factory()->create(['status' => Report::STATUS_PENDING]);

        $response = $this->withJwt('admin_user', 'ADMIN')
            ->patchJson('/api/admin/reports/' . $report->id, [
                'action' => 'reject',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'rejected');
    }
}
