<?php

namespace Database\Factories;

use App\Models\Post;
use Illuminate\Database\Eloquent\Factories\Factory;

class PostFactory extends Factory
{
    protected $model = Post::class;

    public function definition(): array
    {
        return [
            'author_id' => 'user_' . fake()->numberBetween(1, 100),
            'category_id' => fake()->numberBetween(1, 5),
            'type' => fake()->randomElement([Post::TYPE_POST, Post::TYPE_QUESTION]),
            'title' => fake()->sentence(6),
            'content' => fake()->paragraphs(2, true),
            'status' => Post::STATUS_PUBLISHED,
        ];
    }
}
