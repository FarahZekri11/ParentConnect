<?php

namespace Database\Factories;

use App\Models\Comment;
use Illuminate\Database\Eloquent\Factories\Factory;

class CommentFactory extends Factory
{
    protected $model = Comment::class;

    public function definition(): array
    {
        return [
            'post_id' => fake()->numberBetween(1, 100),
            'author_id' => 'user_' . fake()->numberBetween(1, 50),
            'content' => fake()->sentence(8),
            'status' => Comment::STATUS_PUBLISHED,
        ];
    }
}
