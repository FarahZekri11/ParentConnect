<?php

namespace App\Http\Docs;

use OpenApi\Attributes as OA;

#[OA\Schema(
    schema: 'UserResource',
    type: 'object',
    properties: [
        new OA\Property(property: 'id', type: 'integer', example: 1),
        new OA\Property(property: 'name', type: 'string', example: 'Feriel'),
        new OA\Property(property: 'email', type: 'string', example: 'feriel@parentconnect.fr'),
        new OA\Property(property: 'role', type: 'string', enum: ['PARENT', 'PROFESSIONAL', 'ADMIN'], example: 'PARENT'),
        new OA\Property(property: 'phone', type: 'string', nullable: true, example: '+33612345678'),
        new OA\Property(property: 'avatar', type: 'string', nullable: true, example: null),
        new OA\Property(property: 'created_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
        new OA\Property(property: 'updated_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
    ]
)]
#[OA\Schema(
    schema: 'CategoryResource',
    type: 'object',
    properties: [
        new OA\Property(property: 'id', type: 'integer', example: 1),
        new OA\Property(property: 'name', type: 'string', example: 'Santé bébé'),
        new OA\Property(property: 'slug', type: 'string', example: 'sante-bebe'),
        new OA\Property(property: 'description', type: 'string', example: 'Questions, conseils pédiatriques et santé des tout-petits.'),
        new OA\Property(property: 'created_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
    ]
)]
#[OA\Schema(
    schema: 'CommentResource',
    type: 'object',
    properties: [
        new OA\Property(property: 'id', type: 'integer', example: 1),
        new OA\Property(property: 'post_id', type: 'integer', example: 42),
        new OA\Property(property: 'author_id', type: 'string', example: 'user_12345'),
        new OA\Property(property: 'content', type: 'string', example: 'Super conseil, merci beaucoup !'),
        new OA\Property(property: 'status', type: 'string', example: 'published'),
        new OA\Property(property: 'created_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
        new OA\Property(property: 'updated_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
    ]
)]
#[OA\Schema(
    schema: 'PostResource',
    type: 'object',
    properties: [
        new OA\Property(property: 'id', type: 'integer', example: 42),
        new OA\Property(property: 'author_id', type: 'string', example: 'user_12345'),
        new OA\Property(property: 'category_id', type: 'integer', example: 1),
        new OA\Property(property: 'category', ref: '#/components/schemas/CategoryResource'),
        new OA\Property(property: 'type', type: 'string', enum: ['post', 'question'], example: 'question'),
        new OA\Property(property: 'title', type: 'string', example: 'Bébé fait ses dents : que conseiller ?'),
        new OA\Property(property: 'content', type: 'string', example: 'Mon bébé de 6 mois a les gencives douloureuses...'),
        new OA\Property(property: 'status', type: 'string', example: 'published'),
        new OA\Property(property: 'comments_count', type: 'integer', example: 3),
        new OA\Property(property: 'comments', type: 'array', items: new OA\Items(ref: '#/components/schemas/CommentResource')),
        new OA\Property(property: 'created_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
        new OA\Property(property: 'updated_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
    ]
)]
#[OA\Schema(
    schema: 'ReportResource',
    type: 'object',
    properties: [
        new OA\Property(property: 'id', type: 'integer', example: 10),
        new OA\Property(property: 'reporter_id', type: 'string', example: 'user_98765'),
        new OA\Property(property: 'target_type', type: 'string', enum: ['post', 'comment'], example: 'post'),
        new OA\Property(property: 'target_id', type: 'integer', example: 42),
        new OA\Property(property: 'reason', type: 'string', example: 'Publicité interdite'),
        new OA\Property(property: 'details', type: 'string', nullable: true, example: 'Liens commerciaux répétés'),
        new OA\Property(property: 'status', type: 'string', enum: ['pending', 'reviewed', 'rejected'], example: 'pending'),
        new OA\Property(property: 'reviewed_by', type: 'string', nullable: true, example: 'admin_001'),
        new OA\Property(property: 'created_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
        new OA\Property(property: 'updated_at', type: 'string', format: 'date-time', example: '2026-10-15T18:00:00Z'),
    ]
)]
class Schemas
{
}
