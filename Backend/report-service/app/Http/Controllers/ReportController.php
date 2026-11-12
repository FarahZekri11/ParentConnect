<?php

namespace App\Http\Controllers;

use App\Http\Requests\CreateReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;

class ReportController extends Controller
{
    public function __construct(
        protected ReportService $reportService
    ) {}

    public function reportPost(CreateReportRequest $request, int|string $id): JsonResponse
    {
        $reporterId = $request->attributes->get('jwt_user_id');
        $report = $this->reportService->report(Report::TARGET_POST, $id, $request->validated(), $reporterId);

        return (new ReportResource($report))->response()->setStatusCode(201);
    }

    public function reportComment(CreateReportRequest $request, int|string $id): JsonResponse
    {
        $reporterId = $request->attributes->get('jwt_user_id');
        $report = $this->reportService->report(Report::TARGET_COMMENT, $id, $request->validated(), $reporterId);

        return (new ReportResource($report))->response()->setStatusCode(201);
    }
}
