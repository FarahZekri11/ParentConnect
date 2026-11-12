<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReviewReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AdminReportController extends Controller
{
    public function __construct(
        protected ReportService $reportService
    ) {}

    public function index(): AnonymousResourceCollection
    {
        $reports = $this->reportService->getPendingReports();
        return ReportResource::collection($reports);
    }

    public function update(ReviewReportRequest $request, int $id): JsonResponse
    {
        $report = Report::findOrFail($id);
        $adminId = $request->attributes->get('jwt_user_id', 'admin');

        $reviewed = $this->reportService->reviewReport($report, $request->validated(), $adminId);

        return response()->json([
            'data' => new ReportResource($reviewed),
            'message' => 'Signalement traité avec succès.',
        ]);
    }
}
