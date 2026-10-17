<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Report extends Model
{
    use HasFactory;

    public const TARGET_POST = 'post';
    public const TARGET_COMMENT = 'comment';

    public const STATUS_PENDING = 'pending';
    public const STATUS_REVIEWED = 'reviewed';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'reporter_id',
        'target_type',
        'target_id',
        'reason',
        'details',
        'status',
        'reviewed_by',
    ];

    /**
     * Get the associated target entity (Post or Comment).
     */
    public function getTargetEntityAttribute(): mixed
    {
        if ($this->target_type === self::TARGET_POST) {
            return Post::withTrashed()->find($this->target_id);
        }

        if ($this->target_type === self::TARGET_COMMENT) {
            return Comment::withTrashed()->find($this->target_id);
        }

        return null;
    }
}
