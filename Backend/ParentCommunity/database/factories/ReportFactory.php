<?php

namespace Database\Factories;

use App\Models\Post;
use App\Models\Report;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Report>
 */
class ReportFactory extends Factory
{
    protected $model = Report::class;

    public function definition(): array
    {
        return [
            'reporter_id' => 'user_' . Str::random(10),
            'target_type' => Report::TARGET_POST,
            'target_id' => Post::factory(),
            'reason' => fake()->sentence(4),
            'details' => fake()->paragraph(),
            'status' => Report::STATUS_PENDING,
            'reviewed_by' => null,
        ];
    }

    public function reviewed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => Report::STATUS_REVIEWED,
            'reviewed_by' => 'admin_' . Str::random(8),
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => Report::STATUS_REJECTED,
            'reviewed_by' => 'admin_' . Str::random(8),
        ]);
    }
}
