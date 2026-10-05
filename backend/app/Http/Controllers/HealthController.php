<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class HealthController extends Controller
{
    public function index(): JsonResponse
    {
        try {
            DB::connection()->getPdo();
            DB::select('SELECT 1');

            return response()->json([
                'status' => 'ok',
                'message' => 'Backend is healthy',
                'database' => [
                    'status' => 'connected',
                ],
                'application' => [
                    'environment' => config('app.env'),
                ],
            ], 200);
        } catch (Throwable $e) {
            Log::error('Health check failed: ' . $e->getMessage());

            return response()->json([
                'status' => 'error',
                'message' => 'Database connection failed',
                'database' => [
                    'status' => 'disconnected',
                ],
            ], 503);
        }
    }
}
