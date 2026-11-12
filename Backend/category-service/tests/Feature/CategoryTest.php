<?php

namespace Tests\Feature;

use App\Models\Category;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_list_all_categories(): void
    {
        Category::factory()->create([
            'name' => 'Santé bébé',
            'slug' => 'sante-bebe',
        ]);
        Category::factory()->create([
            'name' => 'Alimentation',
            'slug' => 'alimentation',
        ]);

        $response = $this->getJson('/api/categories');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'slug', 'description', 'created_at'],
                ],
            ])
            ->assertJsonCount(2, 'data');
    }
}
