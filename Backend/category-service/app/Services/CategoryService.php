<?php

namespace App\Services;

use App\Models\Category;
use Illuminate\Database\Eloquent\Collection;

class CategoryService
{
    /**
     * Retrieve all categories.
     */
    public function listAll(): Collection
    {
        return Category::orderBy('name')->get();
    }
}
