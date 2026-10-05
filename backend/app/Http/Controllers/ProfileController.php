<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Profile endpoints for the currently authenticated user.
 *
 * Read-only on the existing schema:
 *   tb_user.username  varchar(50)  NOT NULL, UNIQUE
 *   tb_user.nama      varchar(500) NOT NULL
 *   tb_user.foto      varchar(250) NOT NULL   (already exists - no new column)
 *   tb_user.password  varchar(500) NOT NULL   (bcrypt $2y$)
 *
 * There is deliberately no migration, no new table and no new column here.
 * Every write goes through the gate in writeBlocked(), which refuses to touch
 * the database while config('elmech.profile_write_enabled') is false.
 */
class ProfileController extends Controller
{
    /**
     * Update the authenticated user's username and name.
     *
     * This updates the existing tb_user row - it never creates a new user.
     */
    public function update(Request $request): JsonResponse
    {
        $user = Auth::user();

        // Validation always runs first, even in read-only mode, so the UI
        // still reports real problems (blank field, duplicate username,
        // length limit) instead of a generic error.
        $validated = $request->validate([
            'username' => [
                'required',
                'string',
                'min:3',
                'max:50',
                'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('tb_user', 'username')->ignore($user->id_user, 'id_user'),
            ],
            'nama' => [
                'required',
                'string',
                'max:500',
            ],
        ], [
            'username.required' => 'Username wajib diisi.',
            'username.min' => 'Username minimal 3 karakter.',
            'username.max' => 'Username maksimal 50 karakter.',
            'username.regex' => 'Username hanya boleh berisi huruf, angka, titik, underscore, atau strip.',
            'username.unique' => 'Username sudah digunakan oleh user lain.',
            'nama.required' => 'Nama wajib diisi.',
            'nama.max' => 'Nama maksimal 500 karakter.',
        ]);

        if ($blocked = $this->writeBlocked()) {
            return $blocked;
        }

        $user->username = $validated['username'];
        $user->nama = $validated['nama'];
        $user->save();

        // The session is keyed on id_user, so it stays valid - no re-login.
        return response()->json([
            'status' => 'ok',
            'message' => 'Profil berhasil diperbarui.',
            'user' => $user->fresh()->load('level')->toProfileArray(),
        ], 200);
    }

    /**
     * Change the authenticated user's password.
     *
     * The old password is verified with Hash::check against the existing
     * bcrypt hash. The stored value is never returned to the client.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $user = Auth::user();

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed'],
        ], [
            'current_password.required' => 'Password lama wajib diisi.',
            'password.required' => 'Password baru wajib diisi.',
            'password.min' => 'Password baru minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi password tidak sama dengan password baru.',
        ]);

        if (!Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Password lama salah.'],
            ]);
        }

        if ($blocked = $this->writeBlocked()) {
            return $blocked;
        }

        // config('hashing.driver') is bcrypt, the same scheme already used by
        // tb_user ($2y$ prefix), so the new hash stays compatible. No rehash of
        // existing rows is performed.
        $user->password = Hash::make($validated['password']);
        $user->save();

        // Keep the hash cached in the session in sync with the new value.
        // SessionGuard writes it under 'password_hash_<guard name>' and the
        // AuthenticateSession middleware reads exactly that key, so the
        // expression below must stay identical to the one in that middleware.
        // Neither the web nor the api group currently runs AuthenticateSession,
        // so this is purely defensive, but without it a stale cached hash would
        // look like a hijacked session the day that middleware is enabled and
        // would force the user to log out right after changing their password.
        $request->session()->put(
            'password_hash_' . Auth::getDefaultDriver(),
            $user->password
        );

        // Deliberately no Auth::logout() - changing the password must not
        // destroy the current session.
        return response()->json([
            'status' => 'ok',
            'message' => 'Password berhasil diubah.',
        ], 200);
    }

    /**
     * Upload a new profile photo into the existing `foto` column.
     *
     * The photo column already exists, so no schema change is needed. The
     * image file itself is never stored in MySQL: it goes to Laravel's local
     * public disk (storage/app/public/profile) and the ABSOLUTE URL of that
     * file is written to tb_user.foto, e.g.
     * "http://127.0.0.1:8000/storage/profile/49_1712345678_ab12cd.jpg"
     * (APP_URL comes from .env, so production writes
     *  https://backend.elmechtechnology.com/storage/profile/...).
     * Legacy rows still holding a relative path or a bare filename keep
     * working: fotoUrl() resolves every shape on read.
     */
    public function uploadPhoto(Request $request): JsonResponse
    {
        $user = Auth::user();

        $mimes = config('elmech.profile_photo.mimes');

        $validated = $request->validate([
            'foto' => [
                'required',
                'file',
                'image',
                'mimes:' . implode(',', $mimes),
                'max:' . config('elmech.profile_photo.max_kb'),
            ],
        ], [
            'foto.required' => 'Pilih file foto terlebih dahulu.',
            'foto.image' => 'File yang dipilih harus berupa gambar.',
            'foto.mimes' => 'Format foto harus JPG, JPEG, PNG, atau WEBP.',
            'foto.max' => 'Ukuran foto maksimal ' . config('elmech.profile_photo.max_kb') . ' KB.',
        ]);

        if ($blocked = $this->writeBlocked()) {
            return $blocked;
        }

        $file = $request->file('foto');
        $disk = Storage::disk($user->photoDisk());
        $directory = trim((string) config('elmech.profile_photo.directory'), '/');

        // Filename built from the real detected mime type, never trusted from
        // the client, and made unique with the user id so it cannot collide.
        $extension = strtolower($file->guessExtension() ?: 'jpg');
        if (!in_array($extension, $mimes, true)) {
            $extension = 'jpg';
        }

        $filename = $user->id_user . '_' . time() . '_' . Str::random(8) . '.' . $extension;
        $relativePath = $directory . '/' . $filename;

        // 1. Save the NEW file first.
        $stream = fopen($file->getRealPath(), 'rb');

        if ($stream === false || !$disk->put($relativePath, $stream)) {
            if (is_resource($stream)) {
                fclose($stream);
            }

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan file foto. Silakan coba lagi.',
            ], 500);
        }

        if (is_resource($stream)) {
            fclose($stream);
        }

        $previous = $user->foto;

        // 2. Point the EXISTING foto column at the new file. Only the VALUE of
        //    the column changes: it now holds the ABSOLUTE URL (built from the
        //    public disk URL, i.e. APP_URL + "/storage/..."), so the API can
        //    return it ready-to-use and the frontend never prefixes anything.
        //    e.g. "http://127.0.0.1:8000/storage/profile/49_1712_abc12345.jpg"
        //    (in production, with APP_URL=https://backend.elmechtechnology.com)
        $user->foto = $disk->url($relativePath);

        if (!$user->save()) {
            // 3a. Database update failed -> the old photo must NOT be removed.
            $disk->delete($relativePath);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan data foto ke database. Foto lama tidak berubah.',
            ], 500);
        }

        // 3b. Only after a successful DB update is the previous file removed.
        $this->deleteManagedPhoto($previous, $user->photoDisk());

        return response()->json([
            'status' => 'ok',
            'message' => 'Foto profil berhasil diperbarui.',
            'user' => $user->fresh()->load('level')->toProfileArray(),
        ], 200);
    }

    /**
     * The `webelmech` database is READ-ONLY by project policy until the write
     * mechanism is explicitly approved. Returns a 503 response when writing is
     * not permitted, or null when it is.
     */
    private function writeBlocked(): ?JsonResponse
    {
        if (config('elmech.profile_write_enabled')) {
            return null;
        }

        return response()->json([
            'status' => 'error',
            'code' => 'read_only',
            'message' => 'Database webelmech sedang dalam mode read-only. Perubahan data belum diizinkan. Set PROFILE_WRITE_ENABLED=true di .env untuk mengizinkan penulisan.',
        ], 503);
    }

    /**
     * Remove a previously uploaded photo, but only when it is a file inside our
     * own managed storage directory.
     *
     * The column now stores an ABSOLUTE URL, so the physical path has to be
     * recovered from it first:
     *   http://127.0.0.1:8000/storage/profile/49_x.jpg  -> profile/49_x.jpg
     * Only URLs sitting directly on our own public disk base are ever mapped;
     * anything else (legacy "https://.../assesst/Profiles/...", another host,
     * a bare filename) is left untouched, so a file living outside our managed
     * directory can never be deleted from here.
     */
    private function deleteManagedPhoto(?string $stored, string $diskName = 'public'): void
    {
        $stored = trim((string) $stored);

        if ($stored === '') {
            return;
        }

        $disk = Storage::disk($diskName);
        $directory = trim((string) config('elmech.profile_photo.directory'), '/');

        // Absolute URL: only accept it when it points at OUR public disk base
        // ("<APP_URL>/storage/"); otherwise it is an external asset - skip.
        if (preg_match('#^https?://#i', $stored)) {
            $diskBase = rtrim($disk->url(''), '/');

            if ($diskBase === '' || stripos($stored, $diskBase . '/') !== 0) {
                return;
            }

            $stored = substr($stored, strlen($diskBase) + 1);
        }

        // Only ever touch a plain filename inside our managed directory.
        // basename() blocks path traversal such as "../../.env".
        $name = basename($stored);
        $relativePath = $directory . '/' . $name;

        if ($disk->exists($relativePath)) {
            $disk->delete($relativePath);
        }
    }
}