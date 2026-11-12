<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreateCommentRequest;
use App\Http\Resources\CommentResource;
use App\Models\Comment;
use App\Services\CommentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CommentController extends Controller
{
    public function __construct(
        protected CommentService $commentService
    ) {}

    public function indexForPost(int|string $postId): AnonymousResourceCollection
    {
        $comments = Comment::where('post_id', (int) $postId)->published()->latest()->get();

        return CommentResource::collection($comments);
    }

    public function show(int $id): CommentResource
    {
        $comment = Comment::published()->findOrFail($id);

        return new CommentResource($comment);
    }

    public function store(CreateCommentRequest $request, int|string $id): JsonResponse
    {
        $authorId = $request->attributes->get('jwt_user_id');
        $payload = (array) $request->attributes->get('jwt_payload', []);
        $authorName = $payload['name'] ?? $payload['preferred_username'] ?? null;
        $comment = $this->commentService->addComment($id, $request->validated(), $authorId,
            $authorName ? mb_substr((string) $authorName, 0, 120) : null);

        return (new CommentResource($comment))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * PUT /api/comments/{id} : modification du texte par son auteur uniquement
     * (la route existait sans implémentation et renvoyait une erreur 500).
     */
    public function update(CreateCommentRequest $request, int $id): JsonResponse|CommentResource
    {
        $comment = Comment::published()->findOrFail($id);
        $userId = (string) $request->attributes->get('jwt_user_id');
        if ($comment->author_id !== $userId) {
            return response()->json(['message' => 'Seul l\'auteur peut modifier ce commentaire.'], 403);
        }
        $comment->update(['content' => $request->validated()['content']]);

        return new CommentResource($comment->fresh());
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $comment = Comment::findOrFail($id);
        $userId = (string) $request->attributes->get('jwt_user_id');
        $userRole = strtoupper((string) ($request->attributes->get('jwt_role') ?? $request->attributes->get('jwt_user_role') ?? ''));

        if ($comment->author_id !== $userId && $userRole !== 'ADMIN') {
            return response()->json(['message' => 'Action non autorisée.'], 403);
        }

        $comment->delete();

        return response()->json(['message' => 'Commentaire supprimé avec succès']);
    }
}
