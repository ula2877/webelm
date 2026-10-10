<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProjectController;
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
    Route::get('/surat/quotation/next-number', [SuratController::class, 'nextQuotationNumber']);
    Route::get('/surat/{id}', [SuratController::class, 'show'])
        ->where('id', '[0-9]+');

    // Surat Penawaran - INSERT ke tb_surat + tb_surat_item (existing
    // tables, no schema change). PDF dibuat SETELAH data tersimpan.
    Route::post('/surat/quotation', [SuratController::class, 'storeQuotation']);
    Route::post('/surat/quotation/pdf-from-html', [SuratController::class, 'pdfFromHtml']);
    Route::get('/surat/{id}/pdf', [SuratController::class, 'pdf'])
        ->where('id', '[0-9]+');
    Route::get('/surat/{id}/detail', [SuratController::class, 'detail'])
        ->where('id', '[0-9]+');
    Route::delete('/surat/{id}', [SuratController::class, 'destroy'])
        ->where('id', '[0-9]+');
    Route::put('/surat/{id}/quotation', [SuratController::class, 'updateQuotation'])
        ->where('id', '[0-9]+');

    // Invoice - pola yang sama, jenis='invoice'.
    Route::get('/surat/invoice/next-number', [SuratController::class, 'nextInvoiceNumber']);
    Route::post('/surat/invoice', [SuratController::class, 'storeInvoice']);
    Route::put('/surat/{id}/invoice', [SuratController::class, 'updateInvoice'])
        ->where('id', '[0-9]+');

    // Surat generik (Surat Jalan, BAST, Surat Permohonan Pemeriksaan,
    // Surat Permohonan Pembayaran, Kuitansi) - pola yang sama,
    // tersimpan di tb_surat dengan jenis sesuai URL.
    Route::get('/surat/{jenis}/next-number', [SuratController::class, 'nextSuratJenisNumber'])
        ->where('jenis', 'delivery-note|bast|inspection-request|payment-request|kuitansi');
    Route::post('/surat/{jenis}', [SuratController::class, 'storeSuratJenis'])
        ->where('jenis', 'delivery-note|bast|inspection-request|payment-request|kuitansi');
    Route::put('/surat/{id}/{jenis}', [SuratController::class, 'updateSuratJenis'])
        ->where('id', '[0-9]+')
        ->where('jenis', 'delivery-note|bast|inspection-request|payment-request|kuitansi');

    // Surat assets (signature / stamp) - operates on the existing tb_surat_asset
    // table. Files go to the public disk; the absolute URL is stored in `path`.
    Route::get('/surat-assets', [SuratAssetController::class, 'index']);
    Route::post('/surat-assets', [SuratAssetController::class, 'store']);

    // Projects - CRUD penuh atas tb_project existing (tanpa migration).
    // Upload gambar deskripsi (file-only, tanpa record database).
    Route::post('/projects/description-image', [ProjectController::class, 'descriptionImage']);
    // Hapus gambar deskripsi yang sudah tidak dipakai (validasi backend +
    // cek pemakaian bersama sebelum file fisik dihapus).
    Route::post('/projects/description-image/delete', [ProjectController::class, 'deleteDescriptionImage']);
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::post('/projects', [ProjectController::class, 'store']);
    // UUID route must come before {id} route to avoid conflicts
    Route::get('/projects/uuid/{uuid}', [ProjectController::class, 'showByUuid'])
        ->where('uuid', '[a-zA-Z0-9\-]+');
    Route::put('/projects/uuid/{uuid}', [ProjectController::class, 'updateByUuid'])
        ->where('uuid', '[a-zA-Z0-9\-]+');
    
    // Project File Manager - menggunakan UUID untuk identifikasi project
    Route::get('/projects/uuid/{uuid}/files', [ProjectController::class, 'getFiles'])
        ->where('uuid', '[a-zA-Z0-9\-]+');
    Route::post('/projects/uuid/{uuid}/files', [ProjectController::class, 'uploadFile'])
        ->where('uuid', '[a-zA-Z0-9\-]+');
    Route::get('/projects/uuid/{uuid}/files/{fileId}', [ProjectController::class, 'downloadFile'])
        ->where('uuid', '[a-zA-Z0-9\-]+')
        ->where('fileId', '[0-9]+');
    Route::delete('/projects/uuid/{uuid}/files/{fileId}', [ProjectController::class, 'deleteFile'])
        ->where('uuid', '[a-zA-Z0-9\-]+')
        ->where('fileId', '[0-9]+');

    // Project Progress - tb_progress via UUID. id_project selalu di-resolve
    // dari uuid_project di URL; tidak pernah diterima dari input client.
    Route::get('/projects/uuid/{uuid}/progress', [ProjectController::class, 'getProgress'])
        ->where('uuid', '[a-zA-Z0-9\-]+');
    Route::post('/projects/uuid/{uuid}/progress', [ProjectController::class, 'addProgress'])
        ->where('uuid', '[a-zA-Z0-9\-]+');
    Route::delete('/projects/uuid/{uuid}/progress/{progressId}', [ProjectController::class, 'deleteProgress'])
        ->where('uuid', '[a-zA-Z0-9\-]+')
        ->where('progressId', '[0-9]+');

    // Project Payment - tb_pembayaran via UUID. id_project selalu di-resolve
    // dari uuid_project; nominal/jenis divalidasi ulang di backend.
    Route::get('/projects/uuid/{uuid}/pembayaran', [ProjectController::class, 'getPembayaran'])
        ->where('uuid', '[a-zA-Z0-9\-]+');
    Route::post('/projects/uuid/{uuid}/pembayaran', [ProjectController::class, 'addPembayaran'])
        ->where('uuid', '[a-zA-Z0-9\-]+');
    Route::delete('/projects/uuid/{uuid}/pembayaran/{paymentId}', [ProjectController::class, 'deletePembayaran'])
        ->where('uuid', '[a-zA-Z0-9\-]+')
        ->where('paymentId', '[0-9]+');

    Route::get('/projects/{id}', [ProjectController::class, 'show'])
        ->where('id', '[0-9]+');
    Route::put('/projects/{id}', [ProjectController::class, 'update'])
        ->where('id', '[0-9]+');
    Route::delete('/projects/{id}', [ProjectController::class, 'destroy'])
        ->where('id', '[0-9]+');
});

// Fallback route for unauthenticated API requests
Route::get('/login', function (Request $request) {
    return response()->json([
        'status' => 'error',
        'message' => 'Unauthenticated',
    ], 401);
})->name('login');
