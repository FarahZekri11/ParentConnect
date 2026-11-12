<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Post extends Model
{
    use HasFactory, SoftDeletes;

    public const TYPE_POST = 'post';
    public const TYPE_QUESTION = 'question';

    public const STATUS_PUBLISHED = 'published';
    public const STATUS_HIDDEN = 'hidden';
    public const STATUS_DELETED = 'deleted';

    protected $fillable = [
        'author_id',
        'author_name',
        'category_id',
        'type',
        'title',
        'content',
        'images',
        'status',
    ];

    protected $casts = [
        'images' => 'array',
    ];

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PUBLISHED);
    }
}
