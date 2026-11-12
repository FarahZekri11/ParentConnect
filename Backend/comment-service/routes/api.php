<?php

use App\Http\Controllers\CommentController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Comment Service API Routes
|--------------------------------------------------------------------------
*/

// Healthcheck (public)
Route::get('/health', HealthController::class);

// Lecture publique des commentaires
Route::get('/posts/{id}/comments', [CommentController::class, 'indexForPost']);
Route::get('/comments/{id}', [CommentController::class, 'show']);

// Endpoints protégés via JWT
Route::middleware(['jwt.auth'])->group(function () {
    Route::post('/posts/{id}/comments', [CommentController::class, 'store'])->middleware('throttle:60,1');
    Route::put('/comments/{id}', [CommentController::class, 'update']);
    Route::delete('/comments/{id}', [CommentController::class, 'destroy']);
});
