<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Post;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Post>
 */
class PostFactory extends Factory
{
    protected $model = Post::class;

    public function definition(): array
    {
        return [
            'author_id' => 'user_' . Str::random(10),
            'category_id' => Category::factory(),
            'type' => fake()->randomElement([Post::TYPE_POST, Post::TYPE_QUESTION]),
            'title' => fake()->sentence(6),
            'content' => fake()->paragraphs(2, true),
            'status' => Post::STATUS_PUBLISHED,
        ];
    }

    public function hidden(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => Post::STATUS_HIDDEN,
        ]);
    }

    public function deletedStatus(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => Post::STATUS_DELETED,
        ]);
    }
}
