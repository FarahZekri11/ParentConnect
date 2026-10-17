<?php

namespace App\Services;

use App\Models\Comment;
use App\Models\Post;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CommentService
{
    /**
     * Add a comment to a published post.
     */
    public function addComment(Post $post, array $data, string $authorId): Comment
    {
        if ($post->status !== Post::STATUS_PUBLISHED) {
            throw new NotFoundHttpException('Impossible de commenter une publication non disponible.');
        }

        return Comment::create([
            'post_id' => $post->id,
            'author_id' => $authorId,
            'content' => $data['content'],
            'status' => Comment::STATUS_PUBLISHED,
        ]);
    }
}
