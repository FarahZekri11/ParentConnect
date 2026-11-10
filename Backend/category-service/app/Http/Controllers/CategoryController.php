<?php

namespace App\Http\Controllers;

use App\Http\Resources\CategoryResource;
use App\Models\Category;
use App\Services\CategoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CategoryController extends Controller
{
    public function __construct(
        protected CategoryService $categoryService
    ) {}

    public function index(): AnonymousResourceCollection
    {
        $categories = $this->categoryService->listAll();

        return CategoryResource::collection($categories);
    }

    public function show(int|string $id): CategoryResource
    {
        $category = is_numeric($id) ? Category::findOrFail($id) : Category::where('slug', $id)->firstOrFail();

        return new CategoryResource($category);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:100|unique:categories,name',
            'slug' => 'nullable|string|max:100|unique:categories,slug',
            'description' => 'nullable|string|max:500',
        ]);

        if (empty($data['slug'])) {
            $data['slug'] = \Illuminate\Support\Str::slug($data['name']);
        }

        $category = Category::create($data);

        return response()->json([
            'data' => new CategoryResource($category),
            'message' => 'Catégorie créée avec succès',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $category = Category::findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:100|unique:categories,name,' . $id,
            'slug' => 'sometimes|required|string|max:100|unique:categories,slug,' . $id,
            'description' => 'nullable|string|max:500',
        ]);

        $category->update($data);

        return response()->json([
            'data' => new CategoryResource($category),
            'message' => 'Catégorie mise à jour avec succès',
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $category = Category::findOrFail($id);
        $category->delete();

        return response()->json([
            'message' => 'Catégorie supprimée avec succès',
        ]);
    }
}
