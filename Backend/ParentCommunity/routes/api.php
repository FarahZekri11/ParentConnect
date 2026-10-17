<?php

use App\Http\Controllers\AdminReportController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CommentController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\PostController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Community Service API Routes
|--------------------------------------------------------------------------
*/

// Healthcheck (public)
Route::get('/health', HealthController::class);

// Authentification & Gestion Utilisateurs
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/token', [AuthController::class, 'generateToken']); // Générateur rapide pour Swagger
});

// Thématiques / Catégories (public)
Route::get('/categories', [CategoryController::class, 'index']);

// Profil utilisateur public
Route::get('/users/{id}', [UserController::class, 'show']);

// Publications publiques (lecture)
Route::get('/posts', [PostController::class, 'index']);
Route::get('/posts/{id}', [PostController::class, 'show']);

// Endpoints protégés via JWT
Route::middleware(['jwt.auth'])->group(function () {
    // Profil utilisateur connecté
    Route::get('/auth/me', [AuthController::class, 'me']);

    // Création & gestion des publications
    Route::post('/posts', [PostController::class, 'store'])->middleware('throttle:30,1');
    Route::put('/posts/{id}', [PostController::class, 'update']);
    Route::delete('/posts/{id}', [PostController::class, 'destroy']);

    // Commentaires
    Route::post('/posts/{id}/comments', [CommentController::class, 'store'])->middleware('throttle:60,1');

    // Signalements par les utilisateurs
    Route::post('/posts/{id}/report', [ReportController::class, 'reportPost'])->middleware('throttle:20,1');
    Route::post('/comments/{id}/report', [ReportController::class, 'reportComment'])->middleware('throttle:20,1');

    // Administration & Modération (Rôle ADMIN)
    Route::middleware(['role:ADMIN'])->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::prefix('admin')->group(function () {
            Route::get('/reports', [AdminReportController::class, 'index']);
            Route::patch('/reports/{id}', [AdminReportController::class, 'update']);
        });
    });
});
