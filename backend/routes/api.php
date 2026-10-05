<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SuratController;
use App\Http\Controllers\SuratAssetController;
use App\Http\Controllers\UserManagementController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

Route::get('/health', [HealthController::class, 'index']);

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

Route::middleware('auth')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Profile - operates on the authenticated user's existing tb_user row.
    Route::post('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/password', [ProfileController::class, 'changePassword']);
    Route::post('/profile/photo', [ProfileController::class, 'uploadPhoto']);

    // User Management - operates on the existing tb_user table.
    // NOTE: the {id} constraint is digits-only so a crafted path can never be
    // routed into the controller as something other than a primary key.
    Route::get('/users', [UserManagementController::class, 'index']);
    Route::post('/users', [UserManagementController::class, 'store']);
    Route::get('/users/{id}', [UserManagementController::class, 'show'])
        ->where('id', '[0-9]+');
    Route::get('/users/{id}/dependents', [UserManagementController::class, 'dependents'])
        ->where('id', '[0-9]+');
    Route::put('/users/{id}', [UserManagementController::class, 'update'])
        ->where('id', '[0-9]+');
    Route::delete('/users/{id}', [UserManagementController::class, 'destroy'])
        ->where('id', '[0-9]+');

    // Worker Files - only for worker/worker pcb levels
    Route::get('/users/{id}/worker-files', [UserManagementController::class, 'workerFiles'])
        ->where('id', '[0-9]+');
    Route::post('/users/{id}/worker-files', [UserManagementController::class, 'uploadWorkerFile'])
        ->where('id', '[0-9]+');
    Route::delete('/worker-files/{fileId}', [UserManagementController::class, 'deleteWorkerFile'])
        ->where('fileId', '[0-9]+');

    // Surat - operates on the existing tb_surat table.
    Route::get('/surat', [SuratController::class, 'index']);
    Route::get('/surat/{id}', [SuratController::class, 'show'])
        ->where('id', '[0-9]+');

    // Surat Penawaran - INSERT ke tb_surat + tb_surat_item (existing
    // tables, no schema change). PDF dibuat SETELAH data tersimpan.
    Route::post('/surat/quotation', [SuratController::class, 'storeQuotation']);
    Route::get('/surat/{id}/pdf', [SuratController::class, 'pdf'])
        ->where('id', '[0-9]+');

    // Surat assets (signature / stamp) - operates on the existing tb_surat_asset
    // table. Files go to the public disk; the absolute URL is stored in `path`.
    Route::get('/surat-assets', [SuratAssetController::class, 'index']);
    Route::post('/surat-assets', [SuratAssetController::class, 'store']);
});

// Fallback route for unauthenticated API requests
Route::get('/login', function (Request $request) {
    return response()->json([
        'status' => 'error',
        'message' => 'Unauthenticated',
    ], 401);
})->name('login');
