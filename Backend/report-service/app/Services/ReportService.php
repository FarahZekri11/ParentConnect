<?php

namespace App\Services;

use App\Models\Report;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ReportService
{
    public function report(string $targetType, int|string $targetId, array $data, string $reporterId): Report
    {
        $existing = Report::where('reporter_id', $reporterId)
            ->where('target_type', $targetType)
            ->where('target_id', (int) $targetId)
            ->first();

        if ($existing) {
            throw new HttpException(400, 'Vous avez deja signale ce contenu.');
        }

        return Report::create([
            'reporter_id' => $reporterId,
            'target_type' => $targetType,
            'target_id' => (int) $targetId,
            'reason' => $data['reason'],
            'details' => $data['details'] ?? null,
            'status' => Report::STATUS_PENDING,
        ]);
    }

    public function getPendingReports(int $perPage = 15): LengthAwarePaginator
    {
        return Report::where('status', Report::STATUS_PENDING)->latest()->paginate($perPage);
    }

    public function reviewReport(Report $report, array $data, string $adminId): Report
    {
        $action = $data['action'] ?? 'reject';
        $newStatus = in_array($action, ['dismiss', 'reject']) ? Report::STATUS_REJECTED : Report::STATUS_REVIEWED;

        $report->update([
            'status' => $newStatus,
            'reviewed_by' => $adminId,
        ]);

        return $report->fresh();
    }
}