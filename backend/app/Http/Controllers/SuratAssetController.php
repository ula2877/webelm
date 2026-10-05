<?php

namespace App\Http\Controllers;

use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Letter asset endpoints (signature / stamp).
 *
 * Operates strictly on the EXISTING `tb_surat_asset` table. No migration, no
 * new table and no new column - the real schema was inspected and is the only
 * schema used:
 *
 *   id_asset       int(11)      PK, auto_increment
 *   jenis          enum('signature','stamp')   NOT NULL
 *   path           varchar(500) NOT NULL       (absolute URL written by this code)
 *   original_name  varchar(255) NULL
 *   mime           varchar(100) NULL
 *   size           int(11)      NULL
 *   created_by     int(11)      NULL           (tb_user.id_user)
 *   created_at / updated_at / deleted_at
 *
 * The file itself is never stored in MySQL: it goes to Laravel's local `public`
 * disk (storage/app/public/letter-assets) and the ABSOLUTE URL of that file is
 * written to `path`, e.g.
 *   http://127.0.0.1:8000/storage/letter-assets/signature_12_..._abc.png
 * (APP_URL comes from .env, so production writes the production base URL).
 *
 * Legacy values (relative "letter-assets/..." / "/storage/...", or an absolute
 * external URL) are resolved on read by resolveAssetUrl(), so old rows keep
 * working and are never mass-rewritten.
 *
 * Writes are gated behind config('elmech.letter_asset_write_enabled').
 */
class SuratAssetController extends Controller
{
    private const VALID_JENIS = ['signature', 'stamp'];

    /**
     * GET /api/surat-assets?jenis=signature|stamp
     * List previously stored assets of one kind, newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $jenis = $request->query('jenis');

        if ($jenis !== null && $jenis !== '' && !in_array($jenis, self::VALID_JENIS, true)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Jenis asset tidak valid.',
            ], 422);
        }

        $query = DB::table('tb_surat_asset')->whereNull('deleted_at');

        if ($jenis !== null && $jenis !== '') {
            $query->where('jenis', $jenis);
        }

        $rows = $query->orderByDesc('id_asset')->get();

        return response()->json([
            'status' => 'ok',
            'data' => $rows->map(fn ($row) => $this->present($row))->values(),
        ], 200);
    }

    /**
     * POST /api/surat-assets
     * multipart/form-data: jenis = signature|stamp, file = <image>
     */
    public function store(Request $request): JsonResponse
    {
        $mimes = config('elmech.letter_asset.mimes');

        $validated = $request->validate([
            'jenis' => ['required', 'string', 'in:' . implode(',', self::VALID_JENIS)],
            'file' => [
                'required',
                'file',
                'image',
                'mimes:' . implode(',', $mimes),
                'max:' . config('elmech.letter_asset.max_kb'),
            ],
        ], [
            'jenis.required' => 'Jenis asset wajib dipilih.',
            'jenis.in' => 'Jenis asset tidak valid.',
            'file.required' => 'Pilih file terlebih dahulu.',
            'file.image' => 'File yang dipilih harus berupa gambar.',
            'file.mimes' => 'Format file harus JPG, JPEG, PNG, atau WEBP.',
            'file.max' => 'Ukuran file maksimal ' . config('elmech.letter_asset.max_kb') . ' KB.',
        ]);

        if ($blocked = $this->writeBlocked()) {
            return $blocked;
        }

        $user = Auth::user();
        $file = $request->file('file');
        $disk = Storage::disk(config('elmech.letter_asset.disk', 'public'));
        $directory = trim((string) config('elmech.letter_asset.directory'), '/');

        // Extension comes from the server-detected mime, never the client name.
        $extension = strtolower($file->guessExtension() ?: 'png');
        if (!in_array($extension, $mimes, true)) {
            $extension = 'png';
        }

        $originalName = $this->safeOriginalName($file->getClientOriginalName());
        $filename = $validated['jenis'] . '_' . ($user->id_user ?? 0) . '_' . time()
            . '_' . Str::random(8)
            . ($originalName !== '' ? '_' . $originalName : '')
            . '.' . $extension;
        $relativePath = $directory . '/' . $filename;

        // 1. Save the physical file first.
        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false || !$disk->put($relativePath, $stream)) {
            if (is_resource($stream)) {
                fclose($stream);
            }
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan file asset.',
            ], 500);
        }
        if (is_resource($stream)) {
            fclose($stream);
        }

        // 2. INSERT the record with the ABSOLUTE URL in `path`.
        $fileUrl = $disk->url($relativePath);

        try {
            $id = DB::table('tb_surat_asset')->insertGetId([
                'jenis' => $validated['jenis'],
                'path' => $fileUrl,
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'created_by' => $user->id_user ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (QueryException $e) {
            // Roll the file back so a failed insert never leaves an orphan.
            $disk->delete($relativePath);
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan data asset.',
            ], 500);
        }

        $row = DB::table('tb_surat_asset')->where('id_asset', $id)->first();

        return response()->json([
            'status' => 'ok',
            'message' => 'Asset berhasil diunggah.',
            'data' => $this->present($row),
        ], 201);
    }

    // ------------------------------------------------------------------ helpers

    /** Turn a tb_surat_asset row into an API payload with a ready-to-use URL. */
    private function present(object $row): array
    {
        return [
            'id' => (int) $row->id_asset,
            'jenis' => $row->jenis,
            'path' => $row->path,
            'url' => $this->resolveAssetUrl((string) $row->path),
            'original_name' => $row->original_name,
            'mime' => $row->mime,
            'size' => $row->size !== null ? (int) $row->size : null,
            'created_at' => $row->created_at,
        ];
    }

    /**
     * Resolve a stored `path` to a full URL the frontend can load directly.
     *
     * Handles both shapes so legacy rows keep working:
     *   - absolute URL  : returned untouched (external host stays as-is)
     *   - relative      : "letter-assets/x.png" or "/storage/letter-assets/x.png"
     *                     is mapped onto the public disk URL (APP_URL + /storage).
     */
    private function resolveAssetUrl(string $path): string
    {
        $path = trim($path);

        if ($path === '') {
            return '';
        }

        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        $disk = Storage::disk(config('elmech.letter_asset.disk', 'public'));
        $relative = ltrim($path, '/');

        // Drop a leading "storage/" or the disk URL path prefix to avoid
        // applying the base twice (e.g. "/storage/letter-assets/x.png").
        $prefix = trim((string) parse_url($disk->url(''), PHP_URL_PATH), '/');
        if ($prefix !== '' && str_starts_with($relative, $prefix . '/')) {
            $relative = substr($relative, strlen($prefix) + 1);
        }

        return $disk->url($relative);
    }

    /**
     * Sanitize the client filename purely for readability; storage never uses
     * the raw value.
     */
    private function safeOriginalName(string $name): string
    {
        $base = basename(str_replace('\\', '/', $name));
        $base = (string) preg_replace('/[^A-Za-z0-9._-]+/', '_', $base);
        $base = trim($base, '.');

        $dot = strrpos($base, '.');
        if ($dot !== false && $dot > 0) {
            $base = substr($base, 0, $dot);
        }

        return substr(trim($base, '._-'), 0, 60);
    }

    /**
     * Gate the INSERT behind the write flag (same pattern as PROFILE_WRITE_ENABLED).
     */
    private function writeBlocked(): ?JsonResponse
    {
        if (config('elmech.letter_asset_write_enabled')) {
            return null;
        }

        return response()->json([
            'status' => 'error',
            'code' => 'read_only',
            'message' => 'Penulisan asset surat belum diizinkan. Set LETTER_ASSET_WRITE_ENABLED=true di .env untuk mengizinkan.',
        ], 503);
    }
}
