<?php

namespace App\Services;

use App\Models\Comment;

class CommentService
{
    public function addComment(int|string $postId, array $data, string $authorId): Comment
    {
        return Comment::create([
            'post_id' => (int) $postId,
            'author_id' => $authorId,
            'content' => $data['content'],
            'status' => Comment::STATUS_PUBLISHED,
        ]);
    }
}
