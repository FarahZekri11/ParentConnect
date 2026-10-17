<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Comment;
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
        $category = Category::factory()->create();

        $response = $this->withJwt('parent_user_42', 'PARENT')->postJson('/api/posts', [
            'category_id' => $category->id,
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
            'category_id' => $category->id,
            'type' => 'question',
            'status' => 'published',
        ]);
    }

    public function test_can_list_published_posts_and_excludes_hidden(): void
    {
        $category = Category::factory()->create();

        Post::factory()->create([
            'category_id' => $category->id,
            'status' => Post::STATUS_PUBLISHED,
            'title' => 'Publication visible 1',
        ]);
        Post::factory()->create([
            'category_id' => $category->id,
            'status' => Post::STATUS_PUBLISHED,
            'title' => 'Publication visible 2',
        ]);
        Post::factory()->create([
            'category_id' => $category->id,
            'status' => Post::STATUS_HIDDEN,
            'title' => 'Publication cachée modérée',
        ]);

        $response = $this->getJson('/api/posts');

        $response->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }

    public function test_can_filter_posts_by_category_and_type(): void
    {
        $catA = Category::factory()->create(['slug' => 'sante']);
        $catB = Category::factory()->create(['slug' => 'activites']);

        Post::factory()->create(['category_id' => $catA->id, 'type' => 'question']);
        Post::factory()->create(['category_id' => $catA->id, 'type' => 'post']);
        Post::factory()->create(['category_id' => $catB->id, 'type' => 'question']);

        $response = $this->getJson('/api/posts?category=sante&type=question');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data');
    }

    public function test_can_search_posts_by_keyword(): void
    {
        $category = Category::factory()->create();

        Post::factory()->create([
            'category_id' => $category->id,
            'title' => 'Recherche nounou disponible',
            'content' => 'Garde à domicile pour 2 enfants',
        ]);
        Post::factory()->create([
            'category_id' => $category->id,
            'title' => 'Vente poussette',
            'content' => 'Très bon état avec nacelle',
        ]);

        $response = $this->getJson('/api/posts?search=nounou');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Recherche nounou disponible');
    }

    public function test_can_view_post_details_with_published_comments(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create(['category_id' => $category->id]);

        Comment::factory()->create([
            'post_id' => $post->id,
            'status' => Comment::STATUS_PUBLISHED,
            'content' => 'Commentaire visible',
        ]);
        Comment::factory()->create([
            'post_id' => $post->id,
            'status' => Comment::STATUS_HIDDEN,
            'content' => 'Commentaire masqué',
        ]);

        $response = $this->getJson('/api/posts/' . $post->id);

        $response->assertStatus(200)
            ->assertJsonPath('data.id', $post->id)
            ->assertJsonCount(1, 'data.comments');
    }

    public function test_author_can_update_own_post(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create([
            'category_id' => $category->id,
            'author_id' => 'author_999',
            'title' => 'Ancien titre',
        ]);

        $response = $this->withJwt('author_999', 'PARENT')->putJson('/api/posts/' . $post->id, [
            'title' => 'Nouveau titre actualisé',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.title', 'Nouveau titre actualisé');

        $this->assertDatabaseHas('posts', [
            'id' => $post->id,
            'title' => 'Nouveau titre actualisé',
        ]);
    }

    public function test_non_author_cannot_update_post(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create([
            'category_id' => $category->id,
            'author_id' => 'author_original',
        ]);

        $response = $this->withJwt('impostor_user', 'PARENT')->putJson('/api/posts/' . $post->id, [
            'title' => 'Tentative de modification illégale',
        ]);

        $response->assertStatus(403);
    }

    public function test_author_can_delete_own_post(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create([
            'category_id' => $category->id,
            'author_id' => 'author_777',
        ]);

        $response = $this->withJwt('author_777', 'PARENT')->deleteJson('/api/posts/' . $post->id);

        $response->assertStatus(200)
            ->assertJsonPath('message', 'Publication supprimée avec succès.');

        $this->assertSoftDeleted('posts', ['id' => $post->id]);
    }

    public function test_admin_can_delete_any_post(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create([
            'category_id' => $category->id,
            'author_id' => 'user_somebody',
        ]);

        $response = $this->withJwt('admin_root', 'ADMIN')->deleteJson('/api/posts/' . $post->id);

        $response->assertStatus(200);
        $this->assertSoftDeleted('posts', ['id' => $post->id]);
    }

    public function test_non_author_non_admin_cannot_delete_post(): void
    {
        $category = Category::factory()->create();
        $post = Post::factory()->create([
            'category_id' => $category->id,
            'author_id' => 'user_somebody',
        ]);

        $response = $this->withJwt('other_user', 'PARENT')->deleteJson('/api/posts/' . $post->id);

        $response->assertStatus(403);
    }
}
