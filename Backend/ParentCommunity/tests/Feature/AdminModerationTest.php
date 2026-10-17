<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Comment;
use App\Models\Post;
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
        $response = $this->withJwt('parent_user', 'PARENT')
            ->getJson('/api/admin/reports');

        $response->assertStatus(403);
    }

    public function test_professional_cannot_access_admin_reports(): void
    {
        $response = $this->withJwt('pro_user', 'PROFESSIONAL')
            ->getJson('/api/admin/reports');

        $response->assertStatus(403);
    }

    public function test_admin_can_list_reports(): void
    {
        Report::factory()->count(3)->create(['status' => Report::STATUS_PENDING]);
        Report::factory()->create(['status' => Report::STATUS_REVIEWED]);

        $response = $this->withJwt('admin_boss', 'ADMIN')
            ->getJson('/api/admin/reports?status=pending');

        $response->assertStatus(200)
            ->assertJsonCount(3, 'data');
    }

    public function test_admin_can_hide_reported_post(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create([
            'category_id' => $category->id,
            'status' => Post::STATUS_PUBLISHED,
        ]);

        $report = Report::factory()->create([
            'target_type' => Report::TARGET_POST,
            'target_id' => $post->id,
            'status' => Report::STATUS_PENDING,
        ]);

        $response = $this->withJwt('admin_mod', 'ADMIN')
            ->patchJson("/api/admin/reports/{$report->id}", [
                'action' => 'hide_content',
                'notes' => 'Contenu jugé inapproprié',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'reviewed')
            ->assertJsonPath('data.reviewed_by', 'admin_mod');

        // Verify post status is now hidden
        $this->assertEquals(Post::STATUS_HIDDEN, $post->fresh()->status);

        // Verify hidden post no longer appears in public posts list
        $publicList = $this->getJson('/api/posts');
        $publicList->assertStatus(200)
            ->assertJsonMissing(['id' => $post->id]);
    }

    public function test_admin_can_reject_report(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);

        $report = Report::factory()->create([
            'target_type' => Report::TARGET_POST,
            'target_id' => $post->id,
            'status' => Report::STATUS_PENDING,
        ]);

        $response = $this->withJwt('admin_mod', 'ADMIN')
            ->patchJson("/api/admin/reports/{$report->id}", [
                'action' => 'reject',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.reviewed_by', 'admin_mod');

        // Post remains published
        $this->assertEquals(Post::STATUS_PUBLISHED, $post->fresh()->status);
    }
}
