<?php

namespace Database\Factories;

use App\Models\Report;
use Illuminate\Database\Eloquent\Factories\Factory;

class ReportFactory extends Factory
{
    protected $model = Report::class;

    public function definition(): array
    {
        return [
            'reporter_id' => 'user_' . fake()->numberBetween(1, 100),
            'target_type' => fake()->randomElement([Report::TARGET_POST, Report::TARGET_COMMENT]),
            'target_id' => fake()->numberBetween(1, 1000),
            'reason' => fake()->sentence(4),
            'details' => fake()->paragraph(),
            'status' => Report::STATUS_PENDING,
            'reviewed_by' => null,
        ];
    }
}
