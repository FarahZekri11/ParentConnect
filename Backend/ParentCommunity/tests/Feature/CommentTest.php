<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Post;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommentTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_add_comment(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);

        $response = $this->postJson("/api/posts/{$post->id}/comments", [
            'content' => 'Mon commentaire sans token',
        ]);

        $response->assertStatus(401);
    }

    public function test_authenticated_user_can_add_comment(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);

        $response = $this->withJwt('commenter_55', 'PARENT')
            ->postJson("/api/posts/{$post->id}/comments", [
                'content' => 'Très bonne initiative pour le quartier, je participe !',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.post_id', $post->id)
            ->assertJsonPath('data.author_id', 'commenter_55')
            ->assertJsonPath('data.status', 'published')
            ->assertJsonPath('data.content', 'Très bonne initiative pour le quartier, je participe !');

        $this->assertDatabaseHas('comments', [
            'post_id' => $post->id,
            'author_id' => 'commenter_55',
            'status' => 'published',
        ]);
    }

    public function test_cannot_comment_on_hidden_or_nonexistent_post(): void
    {
        $category = Category::factory()->create();
        $hiddenPost = Post::factory()->create([
            'category_id' => $category->id,
            'status' => Post::STATUS_HIDDEN,
        ]);

        $response = $this->withJwt('user_123', 'PARENT')
            ->postJson("/api/posts/{$hiddenPost->id}/comments", [
                'content' => 'Commentaire impossible',
            ]);

        $response->assertStatus(404);
    }
}
