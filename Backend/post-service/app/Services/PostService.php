<?php

namespace App\Services;

use App\Models\Post;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class PostService
{
    public function getPaginated(array $filters = [], int $perPage = 15): LengthAwarePaginator
    {
        $query = Post::query()->published();

        if (! empty($filters['category'])) {
            $query->where('category_id', $filters['category']);
        }

        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (! empty($filters['search'])) {
            $search = '%' . strtolower(trim($filters['search'])) . '%';
            $query->where(function ($q) use ($search) {
                $q->whereRaw('LOWER(title) LIKE ?', [$search])
                  ->orWhereRaw('LOWER(content) LIKE ?', [$search]);
            });
        }

        $direction = strtolower($filters['order'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $query->orderBy('created_at', $direction);

        return $query->paginate($perPage);
    }

    public function getDetails(int|string $id): Post
    {
        $post = Post::query()->published()->find($id);

        if (! $post) {
            throw new NotFoundHttpException('Publication introuvable ou non disponible.');
        }

        return $post;
    }

    public function create(array $data, string $authorId): Post
    {
        return Post::create([
            'author_id' => $authorId,
            'category_id' => $data['category_id'] ?? null,
            'type' => $data['type'] ?? Post::TYPE_POST,
            'title' => $data['title'],
            'content' => $data['content'],
            'status' => Post::STATUS_PUBLISHED,
        ]);
    }

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

        return $post->fresh();
    }

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
