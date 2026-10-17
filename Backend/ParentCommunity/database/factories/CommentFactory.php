<?php

namespace Database\Factories;

use App\Models\Comment;
use App\Models\Post;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Comment>
 */
class CommentFactory extends Factory
{
    protected $model = Comment::class;

    public function definition(): array
    {
        return [
            'post_id' => Post::factory(),
            'author_id' => 'user_' . Str::random(10),
            'content' => fake()->paragraph(),
            'status' => Comment::STATUS_PUBLISHED,
        ];
    }

    public function hidden(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => Comment::STATUS_HIDDEN,
        ]);
    }
}
