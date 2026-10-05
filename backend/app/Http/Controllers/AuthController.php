<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        if (!Auth::attempt($credentials)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Invalid credentials',
            ], 401);
        }

        $request->session()->regenerate();

        $user = Auth::user();

        return response()->json([
            'status' => 'ok',
            'message' => 'Login successful',
            'user' => $user->toProfileArray(),
        ], 200);
    }

    public function me(Request $request): JsonResponse
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'status' => 'error',
                'authenticated' => false,
                'message' => 'Unauthenticated',
            ], 401);
        }

        return response()->json([
            'status' => 'ok',
            'authenticated' => true,
            'user' => $user->toProfileArray(),
        ], 200);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'status' => 'ok',
            'message' => 'Logout successful',
        ], 200);
    }
}
