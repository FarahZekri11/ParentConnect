<?php

namespace App\Services;

use App\Models\Comment;
use App\Models\Post;
use App\Models\Report;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ReportService
{
    /**
     * Report a post.
     */
    public function reportPost(Post $post, array $data, string $reporterId): Report
    {
        $existing = Report::where('reporter_id', $reporterId)
            ->where('target_type', Report::TARGET_POST)
            ->where('target_id', $post->id)
            ->exists();

        if ($existing) {
            throw new BadRequestHttpException('Vous avez déjà signalé cette publication.');
        }

        return Report::create([
            'reporter_id' => $reporterId,
            'target_type' => Report::TARGET_POST,
            'target_id' => $post->id,
            'reason' => $data['reason'],
            'details' => $data['details'] ?? null,
            'status' => Report::STATUS_PENDING,
        ]);
    }

    /**
     * Report a comment.
     */
    public function reportComment(Comment $comment, array $data, string $reporterId): Report
    {
        $existing = Report::where('reporter_id', $reporterId)
            ->where('target_type', Report::TARGET_COMMENT)
            ->where('target_id', $comment->id)
            ->exists();

        if ($existing) {
            throw new BadRequestHttpException('Vous avez déjà signalé ce commentaire.');
        }

        return Report::create([
            'reporter_id' => $reporterId,
            'target_type' => Report::TARGET_COMMENT,
            'target_id' => $comment->id,
            'reason' => $data['reason'],
            'details' => $data['details'] ?? null,
            'status' => Report::STATUS_PENDING,
        ]);
    }

    /**
     * Get paginated reports for admin moderation.
     */
    public function getAdminReports(?string $status = null, int $perPage = 20): LengthAwarePaginator
    {
        $query = Report::query();

        if (! empty($status)) {
            $query->where('status', $status);
        }

        return $query->orderBy('created_at', 'desc')->paginate($perPage);
    }

    /**
     * Process a report (hide target content or reject report).
     */
    public function reviewReport(Report $report, string $action, string $adminId): Report
    {
        if ($action === 'hide_content') {
            if ($report->target_type === Report::TARGET_POST) {
                $post = Post::find($report->target_id);
                if ($post) {
                    $post->update(['status' => Post::STATUS_HIDDEN]);
                }
            } elseif ($report->target_type === Report::TARGET_COMMENT) {
                $comment = Comment::find($report->target_id);
                if ($comment) {
                    $comment->update(['status' => Comment::STATUS_HIDDEN]);
                }
            }

            $report->update([
                'status' => Report::STATUS_REVIEWED,
                'reviewed_by' => $adminId,
            ]);
        } elseif ($action === 'reject') {
            $report->update([
                'status' => Report::STATUS_REJECTED,
                'reviewed_by' => $adminId,
            ]);
        } else {
            throw new BadRequestHttpException('Action de modération non reconnue.');
        }

        return $report->fresh();
    }
}
