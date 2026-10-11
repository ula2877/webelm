<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Membatasi akses ke endpoint khusus admin (User Management & Surat-menyurat).
 *
 * Role ditentukan dari data autentikasi (sesi Laravel) lewat
 * tb_user.id_level -> tb_level.nama_level. Role TIDAK pernah diambil dari
 * parameter/body yang dikirim klien, sehingga tidak bisa dipalsukan.
 *
 * Dijalankan SETELAH middleware 'auth': request tanpa sesi login sudah
 * ditolak 401 lebih dulu. User yang sudah login tetapi bukan admin
 * mendapat HTTP 403 Forbidden.
 *
 * tb_level.id_level yang dianggap admin: 1 (admin). Worker (2), worker pcb
 * (10) dan role lain (client/intern/elprint/elkost) ditolak.
 */
class EnsureAdmin
{
    /** tb_level.id_level untuk role admin. */
    private const ADMIN_LEVEL_IDS = [1];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Jaring pengaman bila middleware ini dipakai tanpa 'auth'. Normalnya
        // 'auth' sudah menangani dengan 401.
        if ($user === null) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthenticated',
            ], 401);
        }

        if (!in_array((int) $user->id_level, self::ADMIN_LEVEL_IDS, true)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Akses ditolak. Halaman ini khusus admin.',
            ], 403);
        }

        return $next($request);
    }
}
