<?php

namespace App\Http\Controllers;

use App\Http\Resources\CategoryResource;
use App\Services\CategoryService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use OpenApi\Attributes as OA;

class CategoryController extends Controller
{
    public function __construct(
        protected CategoryService $categoryService
    ) {}

    #[OA\Get(
        path: '/api/categories',
        summary: 'Liste des catégories',
        description: 'Récupère la liste de toutes les thématiques disponibles pour classer les publications et questions.',
        tags: ['Categories'],
        responses: [
            new OA\Response(
                response: 200,
                description: 'Liste des catégories récupérée avec succès',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(
                            property: 'data',
                            type: 'array',
                            items: new OA\Items(ref: '#/components/schemas/CategoryResource')
                        ),
                    ]
                )
            ),
        ]
    )]
    public function index(): AnonymousResourceCollection
    {
        $categories = $this->categoryService->listAll();

        return CategoryResource::collection($categories);
    }
}
