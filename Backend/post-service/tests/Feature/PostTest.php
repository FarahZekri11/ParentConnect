<?php

namespace Tests\Feature;

use App\Models\Post;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PostTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_create_post(): void
    {
        $response = $this->postJson('/api/posts', [
            'category_id' => 1,
            'type' => 'post',
            'title' => 'Titre non autorisé',
            'content' => 'Contenu du post',
        ]);

        $response->assertStatus(401)
            ->assertJsonStructure(['message']);
    }

    public function test_authenticated_user_can_create_post(): void
    {
        $response = $this->withJwt('parent_user_42', 'PARENT')->postJson('/api/posts', [
            'category_id' => 1,
            'type' => 'question',
            'title' => 'Quel pédiatre conseiller sur le quartier ?',
            'content' => 'Bonjour, nous venons d\'emménager et cherchons un bon pédiatre disponible rapidement.',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.author_id', 'parent_user_42')
            ->assertJsonPath('data.type', 'question')
            ->assertJsonPath('data.status', 'published')
            ->assertJsonPath('data.title', 'Quel pédiatre conseiller sur le quartier ?');

        $this->assertDatabaseHas('posts', [
            'author_id' => 'parent_user_42',
            'category_id' => 1,
            'type' => 'question',
            'status' => 'published',
        ]);
    }

    public function test_can_list_published_posts_and_excludes_hidden(): void
    {
        Post::factory()->create([
            'category_id' => 1,
            'status' => Post::STATUS_PUBLISHED,
            'title' => 'Publication visible 1',
        ]);

        Post::factory()->create([
            'category_id' => 1,
            'status' => Post::STATUS_HIDDEN,
            'title' => 'Publication masquée',
        ]);

        $response = $this->getJson('/api/posts');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Publication visible 1');
    }

    public function test_author_can_update_own_post(): void
    {
        $post = Post::factory()->create([
            'author_id' => 'author_user_1',
            'title' => 'Titre original',
        ]);

        $response = $this->withJwt('author_user_1', 'PARENT')
            ->putJson('/api/posts/' . $post->id, [
                'title' => 'Titre modifié par auteur',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.title', 'Titre modifié par auteur');
    }

    public function test_non_author_cannot_update_post(): void
    {
        $post = Post::factory()->create([
            'author_id' => 'author_user_1',
            'title' => 'Titre original',
        ]);

        $response = $this->withJwt('other_user_2', 'PARENT')
            ->putJson('/api/posts/' . $post->id, [
                'title' => 'Tentative de piratage',
            ]);

        $response->assertStatus(403);
    }

    public function test_author_can_delete_own_post(): void
    {
        $post = Post::factory()->create(['author_id' => 'author_user_1']);

        $response = $this->withJwt('author_user_1', 'PARENT')
            ->deleteJson('/api/posts/' . $post->id);

        $response->assertStatus(200);
        $this->assertSoftDeleted('posts', ['id' => $post->id]);
    }
}
