<?php

namespace Tests\Feature;

use App\Models\Comment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommentTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_add_comment(): void
    {
        $response = $this->postJson('/api/posts/1/comments', [
            'content' => 'Super publication !',
        ]);

        $response->assertStatus(401);
    }

    public function test_authenticated_user_can_add_comment(): void
    {
        $response = $this->withJwt('parent_user_1', 'PARENT')
            ->postJson('/api/posts/1/comments', [
                'content' => 'Merci pour cette recommandation utile.',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.post_id', 1)
            ->assertJsonPath('data.author_id', 'parent_user_1');

        $this->assertDatabaseHas('comments', [
            'post_id' => 1,
            'author_id' => 'parent_user_1',
            'content' => 'Merci pour cette recommandation utile.',
        ]);
    }

    public function test_can_list_comments_for_post(): void
    {
        Comment::factory()->create(['post_id' => 42, 'content' => 'Commentaire A']);
        Comment::factory()->create(['post_id' => 42, 'content' => 'Commentaire B']);

        $response = $this->getJson('/api/posts/42/comments');

        $response->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }
}
