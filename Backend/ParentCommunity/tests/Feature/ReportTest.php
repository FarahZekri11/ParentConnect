<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Comment;
use App\Models\Post;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_report(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);

        $response = $this->postJson("/api/posts/{$post->id}/report", [
            'reason' => 'Spam intempestif',
        ]);

        $response->assertStatus(401);
    }

    public function test_authenticated_user_can_report_post(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);

        $response = $this->withJwt('vigilant_parent', 'PARENT')
            ->postJson("/api/posts/{$post->id}/report", [
                'reason' => 'Contenu inapproprié ou publicitaire',
                'details' => 'Le lien renvoie vers un site marchand non vérifié.',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.target_type', 'post')
            ->assertJsonPath('data.target_id', $post->id)
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.reporter_id', 'vigilant_parent');

        $this->assertDatabaseHas('reports', [
            'target_type' => 'post',
            'target_id' => $post->id,
            'reporter_id' => 'vigilant_parent',
            'status' => 'pending',
        ]);
    }

    public function test_user_cannot_report_same_post_twice(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);

        // First report: success
        $this->withJwt('user_dup', 'PARENT')
            ->postJson("/api/posts/{$post->id}/report", [
                'reason' => 'Premier signalement légitime',
            ])
            ->assertStatus(201);

        // Second report by same user on same post: 400 Bad Request
        $second = $this->withJwt('user_dup', 'PARENT')
            ->postJson("/api/posts/{$post->id}/report", [
                'reason' => 'Deuxième signalement identique',
            ]);

        $second->assertStatus(400)
            ->assertJsonPath('message', 'Vous avez déjà signalé cette publication.');
    }

    public function test_authenticated_user_can_report_comment(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);
        $comment = Comment::factory()->create(['post_id' => $post->id]);

        $response = $this->withJwt('user_abc', 'PARENT')
            ->postJson("/api/comments/{$comment->id}/report", [
                'reason' => 'Commentaire agressif',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.target_type', 'comment')
            ->assertJsonPath('data.target_id', $comment->id)
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('reports', [
            'target_type' => 'comment',
            'target_id' => $comment->id,
            'reporter_id' => 'user_abc',
        ]);
    }

    public function test_user_cannot_report_same_comment_twice(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);
        $comment = Comment::factory()->create(['post_id' => $post->id]);

        $this->withJwt('user_xyz', 'PARENT')
            ->postJson("/api/comments/{$comment->id}/report", [
                'reason' => 'Premier signalement',
            ])
            ->assertStatus(201);

        $second = $this->withJwt('user_xyz', 'PARENT')
            ->postJson("/api/comments/{$comment->id}/report", [
                'reason' => 'Second signalement dupliqué',
            ]);

        $second->assertStatus(400)
            ->assertJsonPath('message', 'Vous avez déjà signalé ce commentaire.');
    }
}
