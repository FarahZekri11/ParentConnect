<?php

namespace App\Services;

use App\Models\Post;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class PostService
{
    /**
     * Get paginated published posts with filters.
     */
    public function getPaginated(array $filters = [], int $perPage = 15): LengthAwarePaginator
    {
        $query = Post::query()
            ->published()
            ->with('category')
            ->withCount(['comments' => function ($q) {
                $q->published();
            }]);

        // Filter by category (id or slug)
        if (! empty($filters['category'])) {
            $cat = $filters['category'];
            $query->whereHas('category', function ($q) use ($cat) {
                if (is_numeric($cat)) {
                    $q->where('id', $cat);
                } else {
                    $q->where('slug', $cat);
                }
            });
        }

        // Filter by type ('post' or 'question')
        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        // Full-text / search in title and content
        if (! empty($filters['search'])) {
            $search = '%' . strtolower(trim($filters['search'])) . '%';
            $query->where(function ($q) use ($search) {
                $q->whereRaw('LOWER(title) LIKE ?', [$search])
                  ->orWhereRaw('LOWER(content) LIKE ?', [$search]);
            });
        }

        // Sorting by date (default descending)
        $direction = strtolower($filters['order'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $query->orderBy('created_at', $direction);

        return $query->paginate($perPage);
    }

    /**
     * Get published post details with category and published comments.
     */
    public function getDetails(int|string $id): Post
    {
        /** @var Post|null $post */
        $post = Post::query()
            ->published()
            ->with(['category', 'comments' => function ($q) {
                $q->published()->orderBy('created_at', 'asc');
            }])
            ->find($id);

        if (! $post) {
            throw new NotFoundHttpException('Publication introuvable ou non disponible.');
        }

        return $post;
    }

    /**
     * Create a new post or question.
     */
    public function create(array $data, string $authorId): Post
    {
        $post = Post::create([
            'author_id' => $authorId,
            'category_id' => $data['category_id'],
            'type' => $data['type'] ?? Post::TYPE_POST,
            'title' => $data['title'],
            'content' => $data['content'],
            'status' => Post::STATUS_PUBLISHED,
        ]);

        return $post->load('category');
    }

    /**
     * Update an existing post (author only).
     */
    public function update(Post $post, array $data, string $userId): Post
    {
        if ($post->author_id !== $userId) {
            throw new AccessDeniedHttpException('Seul l\'auteur peut modifier cette publication.');
        }

        $post->update(array_filter([
            'category_id' => $data['category_id'] ?? null,
            'type' => $data['type'] ?? null,
            'title' => $data['title'] ?? null,
            'content' => $data['content'] ?? null,
        ]));

        return $post->fresh()->load('category');
    }

    /**
     * Delete an existing post (author or ADMIN).
     */
    public function delete(Post $post, string $userId, string $userRole): void
    {
        $isAdmin = strtoupper($userRole) === 'ADMIN';
        $isAuthor = $post->author_id === $userId;

        if (! $isAuthor && ! $isAdmin) {
            throw new AccessDeniedHttpException('Seul l\'auteur ou un administrateur peut supprimer cette publication.');
        }

        $post->update(['status' => Post::STATUS_DELETED]);
        $post->delete();
    }
}
