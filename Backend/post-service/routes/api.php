<?php

use App\Http\Controllers\HealthController;
use App\Http\Controllers\PostController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Post Service API Routes
|--------------------------------------------------------------------------
*/

// Healthcheck (public)
Route::get('/health', HealthController::class);

// Publications publiques (lecture)
Route::get('/posts', [PostController::class, 'index']);
Route::get('/posts/{id}', [PostController::class, 'show']);

// Endpoints protégés via JWT
Route::middleware(['jwt.auth'])->group(function () {
    Route::post('/posts', [PostController::class, 'store'])->middleware('throttle:30,1');
    Route::put('/posts/{id}', [PostController::class, 'update']);
    Route::delete('/posts/{id}', [PostController::class, 'destroy']);
});
