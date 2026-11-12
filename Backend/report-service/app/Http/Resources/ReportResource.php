<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use OpenApi\Attributes as OA;

#[OA\Schema(
    schema: 'ReportResource',
    title: 'ReportResource',
    description: 'Représentation d\'un signalement',
    properties: [
        new OA\Property(property: 'id', type: 'integer', example: 1),
        new OA\Property(property: 'reporter_id', type: 'string', example: 'parent_test'),
        new OA\Property(property: 'target_type', type: 'string', enum: ['post', 'comment'], example: 'post'),
        new OA\Property(property: 'target_id', type: 'integer', example: 1),
        new OA\Property(property: 'reason', type: 'string', example: 'Contenu inapproprié'),
        new OA\Property(property: 'details', type: 'string', nullable: true, example: 'Détails du signalement'),
        new OA\Property(property: 'status', type: 'string', enum: ['pending', 'reviewed', 'rejected'], example: 'pending'),
        new OA\Property(property: 'reviewed_by', type: 'string', nullable: true, example: null),
        new OA\Property(property: 'created_at', type: 'string', format: 'date-time'),
        new OA\Property(property: 'updated_at', type: 'string', format: 'date-time'),
    ]
)]
class ReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reporter_id' => $this->reporter_id,
            'target_type' => $this->target_type,
            'target_id' => $this->target_id,
            'reason' => $this->reason,
            'details' => $this->details,
            'status' => $this->status,
            'reviewed_by' => $this->reviewed_by,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
