<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use OpenApi\Attributes as OA;

#[OA\Schema(
    schema: 'PostResource',
    title: 'PostResource',
    description: 'Représentation d\'une publication ou question',
    properties: [
        new OA\Property(property: 'id', type: 'integer', example: 1),
        new OA\Property(property: 'author_id', type: 'string', example: 'parent_test'),
        new OA\Property(property: 'category_id', type: 'integer', nullable: true, example: 1),
        new OA\Property(property: 'type', type: 'string', enum: ['post', 'question'], example: 'post'),
        new OA\Property(property: 'title', type: 'string', example: 'Conseils pour le sommeil de bébé'),
        new OA\Property(property: 'content', type: 'string', example: 'Routine du soir avec berceuse...'),
        new OA\Property(property: 'status', type: 'string', example: 'published'),
        new OA\Property(property: 'created_at', type: 'string', format: 'date-time'),
        new OA\Property(property: 'updated_at', type: 'string', format: 'date-time'),
    ]
)]
class PostResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'author_id' => $this->author_id,
            'author_name' => $this->author_name,
            'category_id' => $this->category_id,
            'type' => $this->type,
            'title' => $this->title,
            'content' => $this->content,
            'images' => $this->images ?? [],
            'status' => $this->status,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
