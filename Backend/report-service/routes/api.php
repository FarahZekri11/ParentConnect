<?php

use App\Http\Controllers\AdminReportController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ReportController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Report Service API Routes
|--------------------------------------------------------------------------
*/

// Healthcheck (public)
Route::get('/health', HealthController::class);

// Endpoints protégés via JWT
Route::middleware(['jwt.auth'])->group(function () {
    // Signalements par les utilisateurs
    Route::post('/posts/{id}/report', [ReportController::class, 'reportPost'])->middleware('throttle:20,1');
    Route::post('/comments/{id}/report', [ReportController::class, 'reportComment'])->middleware('throttle:20,1');

    // Administration & Modération (Rôle ADMIN)
    Route::middleware(['role:ADMIN'])->group(function () {
        Route::prefix('admin')->group(function () {
            Route::get('/reports', [AdminReportController::class, 'index']);
            Route::patch('/reports/{id}', [AdminReportController::class, 'update']);
        });
    });
});
