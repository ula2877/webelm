<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Project endpoints (CRUD penuh atas tb_project).
 *
 * Mengikuti pola UserManagementController / SuratController:
 *  - response {status:'ok', data, meta} + present() sebagai satu-satunya
 *    tempat row diubah menjadi payload API,
 *  - validasi $request->validate() dengan pesan Indonesia,
 *  - 404 via notFound(), tulis-gagal via writeFailed(), LIKE di-escape,
 *  - paginasi orderBy primary key agar stabil.
 *
 * Batasan skema yang dihormati (tidak ada migration):
 *  - Semua kolom tanggal & harga NOT NULL tanpa default. Karena koneksi
 *    Laravel berjalan strict (tidak bisa tulis '0000-00-00' seperti baris
 *    legacy), ketiga tanggal WAJIB diisi saat tulis; saat baca, nilai
 *    legacy '0000-00-00' dipetakan menjadi null.
 *  - id_client WAJIB menunjuk tb_user.id_user yang ada (FK
 *    tb_project_ibfk_1, ON DELETE/UPDATE CASCADE).
 *  - DELETE = hard delete ($model->delete()); tabel tidak punya
 *    deleted_at. Child (chat/files/pembayaran/progress/tim) ikut terhapus
 *    oleh CASCADE milik database - bukan dibuat di sini.
 *  - Status mengikuti enum DB apa adanya (running/done/cancel); frontend
 *    menampilkan label Indonesianya.
 */
class ProjectController extends Controller
{
    private const DEFAULT_PER_PAGE = 8;

    private const VALID_JENIS = ['pcb', 'project'];

    private const VALID_STATUS = ['running', 'done', 'cancel'];

    private const VALID_URGENCY = ['urgent', 'normal', 'non-urgent'];

    private const DEFAULT_JENIS = 'project';

    /** tb_level.id_level yang dianggap admin (privileged). */
    private const ADMIN_LEVEL_IDS = [1];

    /**
     * GET /api/projects
     * ?search=&status=&jenis=&urgency=&pelunasan=&page=&per_page=
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        $perPage = max(1, min(100, $perPage));

        $currentPage = (int) $request->query('page', 1);
        $currentPage = max(1, $currentPage);

        // Agregat pembayaran sebagai subquery (withCount/withSum) + client
        // di-eager-load: 1 query untuk seluruh halaman, tanpa N+1, tanpa
        // memuat seluruh baris tb_pembayaran ke memori.
        $query = Project::query()
            ->with('client')
            ->withCount([
                'pembayaran as lunas_count' => fn ($q) => $q->where('pelunasan', 'lunas'),
                'pembayaran as dp_count' => fn ($q) => $q->where('pelunasan', 'dp'),
            ])
            ->withSum('pembayaran as total_pembayaran', 'nominal');

        // Pembatasan non-admin: hanya projek yang ditugaskan ke user ini
        // melalui tb_tim (id_worker = user login). Admin melihat seluruh
        // projek. Karena diterapkan pada query dasar, total & pagination ikut
        // menghitung hanya projek yang ditugaskan.
        if (!$this->isAdminUser()) {
            $userId = $this->currentUserId();
            $query->whereHas('team', fn ($q) => $q->where('id_worker', $userId));
        }

        // Search hits uuid_project, judul, deskripsi AND nama customer
        // (relasi existing id_client -> tb_user, tanpa tabel baru).
        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $like = '%' . $this->escapeLike($search) . '%';
            $query->where(function ($inner) use ($like) {
                $inner->where('uuid_project', 'like', $like)
                    ->orWhere('judul', 'like', $like)
                    ->orWhere('deskripsi', 'like', $like)
                    ->orWhereHas('client', fn ($q) => $q->where('nama', 'like', $like));
            });
        }

        $status = $request->query('status');
        if ($status !== null && $status !== '' && $status !== 'all') {
            if (!in_array($status, self::VALID_STATUS, true)) {
                throw ValidationException::withMessages([
                    'status' => ['Filter status tidak valid.'],
                ]);
            }
            $query->where('status', $status);
        }

        $urgency = $request->query('urgency');
        if ($urgency !== null && $urgency !== '' && $urgency !== 'all') {
            if (!in_array($urgency, self::VALID_URGENCY, true)) {
                throw ValidationException::withMessages([
                    'urgency' => ['Filter urgency tidak valid.'],
                ]);
            }
            $query->where('urgency', $urgency);
        }

        // Filter pelunasan (kategori pada halaman daftar Projek):
        //   lunas       = projek punya minimal satu transaksi 'lunas'.
        //   belum_lunas = projek TIDAK punya transaksi 'lunas' sama sekali
        //                 (termasuk projek tanpa pembayaran / hanya 'dp').
        // Pemeriksaan berlaku atas SELURUH baris tb_pembayaran projek, dan
        // whereHas/whereDoesntHave = subquery EXISTS sehingga satu projek
        // tidak pernah tampil ganda walau punya banyak transaksi.
        $pelunasan = $request->query('pelunasan');
        if ($pelunasan !== null && $pelunasan !== '' && $pelunasan !== 'all') {
            if (!in_array($pelunasan, ['lunas', 'belum_lunas'], true)) {
                throw ValidationException::withMessages([
                    'pelunasan' => ['Filter pelunasan tidak valid.'],
                ]);
            }
            if ($pelunasan === 'lunas') {
                $query->whereHas('pembayaran', fn ($q) => $q->where('pelunasan', 'lunas'));
            } else {
                $query->whereDoesntHave('pembayaran', fn ($q) => $q->where('pelunasan', 'lunas'));
            }
        }

        $jenis = $request->query('jenis');
        if ($jenis !== null && $jenis !== '' && $jenis !== 'all') {
            if (!in_array($jenis, self::VALID_JENIS, true)) {
                throw ValidationException::withMessages([
                    'jenis' => ['Filter jenis tidak valid.'],
                ]);
            }
            $query->where('jenis', $jenis);
        }

        // Stable order so pagination never repeats or skips a row.
        $projects = $query->orderBy('id_project')->paginate($perPage, ['*'], 'page', $currentPage);

        return response()->json([
            'status' => 'ok',
            'data' => array_map(fn (Project $project) => $this->present($project), $projects->items()),
            'meta' => [
                'current_page' => $projects->currentPage(),
                'last_page' => $projects->lastPage(),
                'per_page' => $projects->perPage(),
                'total' => $projects->total(),
                'from' => $projects->firstItem(),
                'to' => $projects->lastItem(),
            ],
            // Client options come straight from tb_user (id_client FK target),
            // never from a hardcoded list - mirrors roleOptions() pattern.
            'clients' => $this->clientOptions(),
        ], 200);
    }

    /**
     * GET /api/projects/{id}
     */
    public function show(string $id): JsonResponse
    {
        $project = Project::with(['client', 'team.worker', 'pembayaran'])->find($id);

        if (!$project || !$this->canAccessProject($project)) {
            return $this->notFound();
        }

        return response()->json([
            'status' => 'ok',
            'data' => $this->present($project),
        ], 200);
    }

    /**
     * GET /api/projects/uuid/{uuid}
     * Find project by uuid_project (for public-facing view URLs).
     */
    public function showByUuid(string $uuid): JsonResponse
    {
        $project = Project::with(['client', 'team.worker', 'pembayaran'])
            ->where('uuid_project', $uuid)
            ->first();

        if (!$project || !$this->canAccessProject($project)) {
            return $this->notFound();
        }

        return response()->json([
            'status' => 'ok',
            'data' => $this->present($project),
        ], 200);
    }

    /**
     * POST /api/projects
     *
     * Transaksional: tb_project + tb_tim (worker). Gagal di salah satu =
     * rollback, tidak pernah ada project tanpa team yang diminta.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateProject($request);

        try {
            $project = DB::transaction(function () use ($validated, $request) {
                $project = new Project();
                $this->fillProject($project, $validated, $request);
                $project->save();
                $this->syncTeam($project, $validated['worker_ids'] ?? []);
                return $project;
            });
        } catch (QueryException $e) {
            return $this->writeFailed('Gagal membuat projek baru.');
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Projek berhasil ditambahkan.',
            'data' => $this->present($project->fresh()->load(['client', 'team.worker', 'pembayaran'])),
        ], 201);
    }

    /**
     * PUT /api/projects/{id}
     *
     * Transaksional. Worker di-replace HANYA untuk project ini: hapus
     * baris tb_tim miliknya lalu insert ulang pilihan baru. Project lain
     * tidak tersentuh.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $project = Project::find($id);

        if (!$project) {
            return $this->notFound();
        }

        $validated = $this->validateProject($request);

        try {
            DB::transaction(function () use ($project, $validated, $request) {
                $this->fillProject($project, $validated, $request);
                $project->save();
                $this->syncTeam($project, $validated['worker_ids'] ?? []);
            });
        } catch (QueryException $e) {
            return $this->writeFailed('Gagal menyimpan perubahan projek.');
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Projek berhasil diperbarui.',
            'data' => $this->present($project->fresh()->load(['client', 'team.worker', 'pembayaran'])),
        ], 200);
    }

    /**
     * PUT /api/projects/uuid/{uuid}
     *
     * Update project by uuid_project (for public-facing edit URLs).
     * Transaksional. Worker di-replace HANYA untuk project ini.
     */
    public function updateByUuid(Request $request, string $uuid): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project) {
            return $this->notFound();
        }

        $validated = $this->validateProject($request);

        try {
            DB::transaction(function () use ($project, $validated, $request) {
                $this->fillProject($project, $validated, $request);
                $project->save();
                $this->syncTeam($project, $validated['worker_ids'] ?? []);
            });
        } catch (QueryException $e) {
            return $this->writeFailed('Gagal menyimpan perubahan projek.');
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Projek berhasil diperbarui.',
            'data' => $this->present($project->fresh()->load(['client', 'team.worker', 'pembayaran'])),
        ], 200);
    }

    /**
     * POST /api/projects/description-image
     * multipart/form-data: file = <image>
     *
     * Upload gambar untuk WYSIWYG deskripsi project. File disimpan ke disk
     * `public` lokal (storage/app/public/project-description) dan yang
     * dikembalikan HANYA absolute URL-nya - tidak ada INSERT ke database,
     * tidak ada tabel baru. Frontend menaruh URL itu di <img> dalam HTML
     * deskripsi; tb_project.deskripsi menyimpan HTML-nya (bukan base64).
     * Base URL berasal dari APP_URL (.env), tidak di-hardcode.
     */
    public function descriptionImage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => [
                'required',
                'file',
                'image',
                'mimes:jpg,jpeg,png,webp',
                'max:4096',
            ],
        ], [
            'file.required' => 'Pilih file gambar terlebih dahulu.',
            'file.image' => 'File yang dipilih harus berupa gambar.',
            'file.mimes' => 'Format file harus JPG, JPEG, PNG, atau WEBP.',
            'file.max' => 'Ukuran file maksimal 4096 KB.',
        ]);

        $file = $request->file('file');
        $disk = Storage::disk('public');
        $directory = $this->descriptionImageDirectory();

        // Extension comes from the server-detected mime, never the client name.
        $extension = strtolower($file->guessExtension() ?: 'png');
        if (!in_array($extension, ['jpg', 'jpeg', 'png', 'webp'], true)) {
            $extension = 'png';
        }

        $user = Auth::user();
        $filename = 'project_desc_' . ($user->id_user ?? 0) . '_' . time()
            . '_' . Str::random(8) . '.' . $extension;
        $relativePath = $directory . '/' . $filename;

        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false || !$disk->put($relativePath, $stream)) {
            if (is_resource($stream)) {
                fclose($stream);
            }
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan file gambar.',
            ], 500);
        }
        if (is_resource($stream)) {
            fclose($stream);
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Gambar berhasil diunggah.',
            'data' => [
                'url' => $disk->url($relativePath),
            ],
        ], 201);
    }

    /**
     * POST /api/projects/description-image/delete
     * JSON: { urls: string[] }
     *
     * Menghapus file gambar WYSIWYG yang SUDAH TIDAK dipakai lagi. Tidak ada
     * tabel metadata: satu-satunya "record" adalah URL <img> di dalam
     * tb_project.deskripsi, jadi keamanan bergantung pada dua hal:
     *
     *   1) URL divalidasi ketat (host harus host aplikasi, path harus berada
     *      di folder storage/app/public/project-description, tanpa traversal)
     *      -> tidak ada penghapusan file arbitrer.
     *   2) File hanya dihapus bila TIDAK ada satu pun baris tb_project yang
     *      masih mereferensikan nama file tersebut -> gambar yang dipakai
     *      bersama project lain tidak ikut terhapus.
     *
     * Idempotent & aman diulang: URL yang sudah tidak ada dianggap sukses.
     */
    public function deleteDescriptionImage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'urls' => ['required', 'array', 'max:50'],
            'urls.*' => ['string', 'max:1000'],
        ], [
            'urls.required' => 'Daftar gambar yang akan dihapus wajib diisi.',
            'urls.array' => 'Daftar gambar tidak valid.',
            'urls.max' => 'Terlalu banyak gambar dalam satu permintaan.',
            'urls.*.string' => 'URL gambar tidak valid.',
            'urls.*.max' => 'URL gambar terlalu panjang.',
        ]);

        $disk = Storage::disk('public');
        $directory = $this->descriptionImageDirectory();

        $deleted = [];
        $skipped = [];
        $failed = [];

        foreach (array_values(array_unique($validated['urls'])) as $url) {
            $filename = $this->resolveDescriptionImageFilename((string) $url, $directory);

            // Bukan file milik aplikasi (domain lain / folder lain / traversal):
            // jangan sentuh filesystem lokal.
            if ($filename === null) {
                $skipped[] = ['url' => $url, 'reason' => 'not_app_owned'];
                continue;
            }

            // Masih direferensikan project (ini atau project lain) -> jangan hapus.
            if ($this->descriptionImageInUse($filename)) {
                $skipped[] = ['url' => $url, 'reason' => 'in_use'];
                continue;
            }

            $relativePath = $directory . '/' . $filename;

            try {
                if ($disk->exists($relativePath) && !$disk->delete($relativePath)) {
                    $failed[] = ['url' => $url, 'reason' => 'delete_failed'];
                    continue;
                }
            } catch (\Throwable $e) {
                // Jangan pernah bocorkan detail driver ke browser.
                $failed[] = ['url' => $url, 'reason' => 'delete_failed'];
                continue;
            }

            $deleted[] = $url;
        }

        if (!empty($failed)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Sebagian gambar gagal dihapus.',
                'data' => [
                    'deleted' => $deleted,
                    'skipped' => $skipped,
                    'failed' => $failed,
                ],
            ], 500);
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Penghapusan gambar selesai.',
            'data' => [
                'deleted' => $deleted,
                'skipped' => $skipped,
                'failed' => $failed,
            ],
        ], 200);
    }

    /** Folder gambar deskripsi WYSIWYG di dalam disk `public`. */
    private function descriptionImageDirectory(): string
    {
        return 'project-description';
    }

    /**
     * Ubah URL gambar deskripsi menjadi nama file yang aman pada folder yang
     * diizinkan. Mengembalikan null bila URL bukan milik aplikasi ini.
     *
     * Aturan:
     *  - host (bila ada) harus sama dengan host storage aplikasi;
     *  - path harus mengandung "/<storage-prefix>/project-description/";
     *  - hanya SATU segmen nama file setelah folder (tanpa "/" tambahan);
     *  - nama file hanya [A-Za-z0-9._-] dengan ekstensi gambar yang didukung.
     */
    private function resolveDescriptionImageFilename(string $url, string $directory): ?string
    {
        $url = trim($url);
        if ($url === '') {
            return null;
        }

        $parts = parse_url($url);
        if ($parts === false) {
            return null;
        }

        $diskUrl = Storage::disk('public')->url('');
        $expected = parse_url($diskUrl) ?: [];
        $expectedHost = $expected['host'] ?? null;
        $expectedPort = $expected['port']
            ?? ((($expected['scheme'] ?? '') === 'https') ? 443 : 80);
        $host = $parts['host'] ?? null;

        // URL eksternal (atau host/port tak terverifikasi) tidak pernah menjadi
        // dasar penghapusan file lokal.
        if ($host !== null) {
            $port = $parts['port']
                ?? ((($parts['scheme'] ?? '') === 'https') ? 443 : 80);
            if ($expectedHost === null
                || strcasecmp($host, $expectedHost) !== 0
                || $port !== $expectedPort) {
                return null;
            }
        }

        $prefix = trim((string) parse_url($diskUrl, PHP_URL_PATH), '/');
        if ($prefix === '') {
            $prefix = 'storage';
        }

        $needle = '/' . $prefix . '/' . $directory . '/';
        $path = (string) ($parts['path'] ?? '');
        $pos = strpos($path, $needle);
        if ($pos === false) {
            return null;
        }

        $rest = substr($path, $pos + strlen($needle));
        if ($rest === '' || str_contains($rest, '/')) {
            return null;
        }

        if (!preg_match('/^[A-Za-z0-9._-]+$/', $rest)) {
            return null;
        }

        if (!preg_match('/\.(jpg|jpeg|png|webp)$/i', $rest)) {
            return null;
        }

        return $rest;
    }

    /**
     * Apakah nama file masih direferensikan oleh deskripsi project mana pun.
     * Pencarian LIKE di-escape agar karakter `_` pada nama file tidak menjadi
     * wildcard.
     */
    private function descriptionImageInUse(string $filename): bool
    {
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $filename);

        return DB::table('tb_project')
            ->where('deskripsi', 'like', '%' . $escaped . '%')
            ->exists();
    }

    /**
     * DELETE /api/projects/{id}
     *
     * Hard delete - tabel tidak punya deleted_at. Child rows ikut terhapus
     * via ON DELETE CASCADE milik database (bukan dibuat di sini).
     */
    public function destroy(string $id): JsonResponse
    {
        $project = Project::find($id);

        if (!$project) {
            return $this->notFound();
        }

        try {
            $project->delete();
        } catch (QueryException $e) {
            // Never surface a driver error or stack trace to the browser.
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menghapus projek. Projek mungkin masih digunakan oleh data lain.',
            ], 409);
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Projek berhasil dihapus.',
            'deleted' => [
                'id' => (int) $project->id_project,
            ],
        ], 200);
    }

    /**
     * GET /api/projects/uuid/{uuid}/files
     *
     * List files for a project identified by uuid_project.
     */
    public function getFiles(string $uuid): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project) {
            return $this->notFound();
        }

        $files = DB::table('tb_files')
            ->where('id_parent', $project->id_project)
            ->orderByDesc('datetime')
            ->orderByDesc('id')
            ->get();

        $disk = Storage::disk(config('elmech.project_file.disk', 'public'));

        // path bisa berupa full URL (format baru) atau path relatif lama; helper
        // resolveStoredPath() memetakan keduanya ke file fisik dengan aman.
        $data = $files->map(function ($file) use ($disk) {
            $stored = (string) $file->path;
            $name = basename((string) parse_url($stored, PHP_URL_PATH) ?: $stored);
            $exists = $this->fileExistsOnDisk($disk, $stored);
            $size = $exists ? $this->fileSizeOnDisk($disk, $stored) : null;
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

            return [
                'id' => (int) $file->id,
                'name' => $name,
                'original_name' => $name,
                'extension' => $ext,
                'size' => $size,
                'size_human' => $size ? $this->formatBytes($size) : 'Unknown',
                'datetime' => $file->datetime,
                'url' => $this->fileUrlOnDisk($disk, $stored),
                'can_preview' => in_array($ext, ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt'], true),
            ];
        });

        return response()->json([
            'status' => 'ok',
            'data' => $data,
        ], 200);
    }

    /**
     * POST /api/projects/uuid/{uuid}/files
     *
     * Upload a file for a project identified by uuid_project.
     * File is stored in tb_files with id_parent = project.id_project.
     */
    public function uploadFile(Request $request, string $uuid): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project) {
            return $this->notFound();
        }

        $config = config('elmech.project_file');
        $allowedMimes = $config['mimes'] ?? [];
        $maxKb = $config['max_kb'] ?? 20480;

        $validated = $request->validate([
            'file' => [
                'required',
                'file',
                'max:' . $maxKb,
            ],
        ], [
            'file.required' => 'Pilih file terlebih dahulu.',
            'file.max' => 'Ukuran file maksimal ' . ($maxKb / 1024) . ' MB.',
        ]);

        $file = $request->file('file');
        $extension = strtolower($file->guessExtension() ?: 'bin');

        if (!in_array($extension, $allowedMimes, true)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Format file tidak diizinkan. Format yang diperbolehkan: ' . implode(', ', $allowedMimes),
            ], 422);
        }

        $disk = Storage::disk($config['disk'] ?? 'public');
        $directory = trim($config['directory'] ?? 'project-files', '/');

        $user = Auth::user();
        $safeName = Str::slug(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'file';
        $filename = $safeName . '_' . time() . '_' . Str::random(8) . '.' . $extension;
        $relativePath = $directory . '/' . $filename;

        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false || !$disk->put($relativePath, $stream)) {
            if (is_resource($stream)) {
                fclose($stream);
            }
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan file.',
            ], 500);
        }
        if (is_resource($stream)) {
            fclose($stream);
        }

        // Record in tb_files. If the insert fails the freshly written file is
        // removed again so it does not become an orphan on disk.
        try {
            $fileId = DB::table('tb_files')->insertGetId([
                'id_parent' => $project->id_project,
                'sender' => $user->id_user ?? 0,
                'datetime' => now(),
                'path' => $relativePath,
            ]);
        } catch (\Throwable $e) {
            $disk->delete($relativePath);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan data file.',
            ], 500);
        }

        $fileUrl = $disk->url($relativePath);
        $size = $disk->size($relativePath);
        $ext = $extension;

        return response()->json([
            'status' => 'ok',
            'message' => 'File berhasil diunggah.',
            'data' => [
                'id' => (int) $fileId,
                'name' => basename($relativePath),
                'original_name' => $file->getClientOriginalName(),
                'extension' => $ext,
                'size' => $size,
                'size_human' => $this->formatBytes($size),
                'datetime' => now()->toDateTimeString(),
                'url' => $fileUrl,
                'can_preview' => in_array($ext, ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt']),
            ],
        ], 201);
    }

    /**
     * GET /api/projects/uuid/{uuid}/files/{fileId}
     *
     * Stream a file that belongs to the project. The file is resolved from the
     * database record (never from a caller supplied path) and is guaranteed to
     * live inside the configured project-file directory.
     */
    public function downloadFile(string $uuid, int $fileId): StreamedResponse|JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project || !$this->canAccessProject($project)) {
            return $this->notFound();
        }

        $file = DB::table('tb_files')
            ->where('id', $fileId)
            ->where('id_parent', $project->id_project)
            ->first();

        if (!$file) {
            return $this->notFound();
        }

        $config = config('elmech.project_file');
        $disk = Storage::disk($config['disk'] ?? 'public');

        // path berasal dari database, tetapi tetap dipetakan ke dalam direktori
        // yang diizinkan sebelum menyentuh filesystem (mendukung full URL baru
        // maupun path relatif lama).
        $relativePath = $this->resolveStoredPath($file->path);

        if ($relativePath === null || !$disk->exists($relativePath)) {
            return response()->json([
                'status' => 'error',
                'message' => 'File tidak ditemukan di storage.',
            ], 404);
        }

        return $disk->download($relativePath, basename($relativePath));
    }

    /**
     * DELETE /api/projects/uuid/{uuid}/files/{fileId}
     *
     * Delete a file for a project.
     */
    public function deleteFile(string $uuid, int $fileId): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project) {
            return $this->notFound();
        }

        $file = DB::table('tb_files')
            ->where('id', $fileId)
            ->where('id_parent', $project->id_project)
            ->first();

        if (!$file) {
            return $this->notFound();
        }

        $config = config('elmech.project_file');
        $disk = Storage::disk($config['disk'] ?? 'public');

        // Hanya hapus file fisik yang bisa dipetakan dari record DB DAN berada
        // di dalam direktori yang diizinkan (full URL baru / path relatif lama).
        $relativePath = $this->resolveStoredPath($file->path);
        if ($relativePath !== null && $disk->exists($relativePath)) {
            $disk->delete($relativePath);
        }

        // Delete database record
        DB::table('tb_files')->where('id', $fileId)->delete();

        return response()->json([
            'status' => 'ok',
            'message' => 'File berhasil dihapus.',
        ], 200);
    }

    /**
     * GET /files/{filename}
     *
     * Melayani file berdasarkan nama file yang tersimpan di tb_files.path
     * (format URL "<base>/files/<nama>"). Nama file divalidasi supaya tetap
     * berada di dalam direktori file projek sehingga tidak bisa dipakai untuk
     * membaca file lain di server. Nama file yang diunggah acak & unik.
     */
    public function serveFile(string $filename): StreamedResponse|JsonResponse
    {
        $config = config('elmech.project_file');
        $disk = Storage::disk($config['disk'] ?? 'public');

        $relativePath = $this->projectFileName($filename);

        if ($relativePath === null || !$disk->exists($relativePath)) {
            return response()->json([
                'status' => 'error',
                'message' => 'File tidak ditemukan.',
            ], 404);
        }

        return $disk->response($relativePath, $filename, [], 'inline');
    }

    /**
     * GET /api/projects/uuid/{uuid}/progress
     *
     * Riwayat progress projek, terbaru lebih dulu. Projek di-resolve dari
     * uuid_project - tabel tb_progress hanya diakses lewat id_project internal.
     * Nilai progress adalah persentase kondisi saat pencatatan (bukan agregat).
     *
     * Lampiran: kolom tb_progress.id_file menyimpan JSON array ID tb_files.
     * Tiap file diverifikasi ulang id_parent-nya terhadap project ini supaya
     * file milik project lain tidak pernah bocor sebagai lampiran.
     */
    public function getProgress(string $uuid): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project || !$this->canAccessProject($project)) {
            return $this->notFound();
        }

        $disk = Storage::disk(config('elmech.project_file.disk', 'public'));

        // created_at terbaru sebagai urutan utama; id sebagai tie-breaker agar
        // urutan deterministik saat dua baris punya created_at yang sama.
        $rows = DB::table('tb_progress')
            ->where('id_project', $project->id_project)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        $data = $rows
            ->map(fn ($row) => $this->presentProgress($row, (int) $project->id_project, $disk))
            ->all();

        return response()->json([
            'status' => 'ok',
            'data' => $data,
            'meta' => [
                'total' => count($data),
                'latest' => $data[0] ?? null,
            ],
        ], 200);
    }

    /**
     * POST /api/projects/uuid/{uuid}/progress
     *
     * Tambah satu catatan progress (opsional dengan banyak lampiran) untuk
     * projek yang di-resolve dari UUID. id_project selalu berasal dari
     * uuid_project di URL, tidak pernah dari input client.
     *
     * Alur penyimpanan:
     *   1. Validasi seluruh input + tiap file (ukuran, ekstensi berbasis MIME,
     *      jumlah) sebelum ada efek samping.
     *   2. Tulis file fisik + INSERT tb_files di dalam transaksi DB.
     *   3. Simpan JSON array ID tb_files ke tb_progress.id_file.
     * Filesystem tidak ikut ter-rollback oleh DB, jadi setiap jalur gagal
     * menghapus file fisik yang sudah terlanjur ditulis (cleanupFiles()).
     */
    public function addProgress(Request $request, string $uuid): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project || !$this->canAccessProject($project)) {
            return $this->notFound();
        }

        $config = config('elmech.project_file');
        $allowedMimes = $config['mimes'] ?? [];
        $maxKb = $config['max_kb'] ?? 20480;
        $maxFiles = (int) config('elmech.project_progress.max_files', 10);
        $diskName = $config['disk'] ?? 'public';
        $directory = trim($config['directory'] ?? 'project-files', '/');
        $maxIdFileBytes = 100; // varchar(100)

        $validated = $request->validate([
            'progress' => ['required', 'integer', 'min:0', 'max:100'],
            'deskripsi' => ['required', 'string'],
            'files' => ['nullable', 'array', 'max:' . $maxFiles],
            'files.*' => ['file', 'max:' . $maxKb],
        ], [
            'progress.required' => 'Nilai progress wajib diisi.',
            'progress.integer' => 'Nilai progress harus berupa angka.',
            'progress.min' => 'Nilai progress minimal 0.',
            'progress.max' => 'Nilai progress maksimal 100.',
            'deskripsi.required' => 'Deskripsi progress wajib diisi.',
            'deskripsi.string' => 'Deskripsi progress tidak valid.',
            'files.array' => 'Daftar lampiran tidak valid.',
            'files.max' => 'Maksimal ' . $maxFiles . ' lampiran per catatan progress.',
            'files.*.file' => 'Lampiran tidak valid.',
            'files.*.max' => 'Ukuran tiap lampiran maksimal ' . ($maxKb / 1024) . ' MB.',
        ]);

        // 'required' + 'string' masih memungkinkan string berisi spasi saja.
        $deskripsi = trim((string) $validated['deskripsi']);
        if ($deskripsi === '') {
            throw ValidationException::withMessages([
                'deskripsi' => ['Deskripsi progress wajib diisi.'],
            ]);
        }

        $files = $request->file('files', []);
        if (!is_array($files)) {
            $files = $files ? [$files] : [];
        }

        // Validasi tipe/ekstensi berbasis MIME (bukan hanya nama file) sebelum
        // menulis apa pun. guessExtension() membaca MIME asli lewat finfo.
        foreach ($files as $index => $file) {
            if (!$file || !$file->isValid()) {
                throw ValidationException::withMessages([
                    "files.{$index}" => ['Lampiran gagal diunggah.'],
                ]);
            }

            $extension = strtolower($file->guessExtension() ?: '');
            if ($extension === '' || !in_array($extension, $allowedMimes, true)) {
                throw ValidationException::withMessages([
                    "files.{$index}" => [
                        'Format lampiran tidak diizinkan. Format yang diperbolehkan: ' . implode(', ', $allowedMimes),
                    ],
                ]);
            }
        }

        $progress = (int) $validated['progress'];
        $user = Auth::user();
        $disk = Storage::disk($diskName);
        $now = now();
        $writtenPaths = [];
        $fileIds = [];

        try {
            DB::beginTransaction();

            foreach ($files as $file) {
                $extension = strtolower($file->guessExtension() ?: 'bin');

                // Nama file fisik acak & unik (bukan nama asli pengguna) agar
                // tidak bisa ditebak / bentrok, dengan ekstensi asli yang valid.
                $filename = $this->randomFileName($extension);
                $relativePath = $directory . '/' . $filename;

                $stream = fopen($file->getRealPath(), 'rb');
                $stored = $stream !== false && $disk->put($relativePath, $stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }
                if (!$stored) {
                    throw new \RuntimeException('Gagal menyimpan file lampiran.');
                }
                $writtenPaths[] = $relativePath;

                // tb_files.path menyimpan FULL URL (bukan path relatif).
                $fileIds[] = (int) DB::table('tb_files')->insertGetId([
                    'id_parent' => $project->id_project,
                    'sender' => $user->id_user ?? 0,
                    'datetime' => $now,
                    'path' => $this->publicFileUrl($filename),
                ]);
            }

            // id_file hanya varchar(100): pastikan JSON array muat. Jangan
            // memotong string atau menyimpan JSON yang tidak valid.
            $idFileJson = empty($fileIds) ? null : json_encode($fileIds);
            if ($idFileJson !== null && strlen($idFileJson) > $maxIdFileBytes) {
                throw ValidationException::withMessages([
                    'files' => ['Terlalu banyak lampiran untuk disimpan. Kurangi jumlah file.'],
                ]);
            }

            $progressId = (int) DB::table('tb_progress')->insertGetId([
                'id_project' => $project->id_project,
                'id_file' => $idFileJson,
                'progress' => $progress,
                'deskripsi' => $deskripsi,
                'created_at' => $now,
            ]);

            DB::commit();
        } catch (ValidationException $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->cleanupFiles($disk, $writtenPaths);

            throw $e;
        } catch (\Throwable $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->cleanupFiles($disk, $writtenPaths);

            return $this->writeFailed('Gagal menyimpan progress.');
        }

        $row = (object) [
            'id' => $progressId,
            'progress' => $progress,
            'deskripsi' => $deskripsi,
            'created_at' => $now->toDateTimeString(),
            'id_file' => $idFileJson,
        ];

        return response()->json([
            'status' => 'ok',
            'message' => 'Progress berhasil disimpan.',
            'data' => $this->presentProgress($row, (int) $project->id_project, $disk),
        ], 201);
    }

    /**
     * DELETE /api/projects/uuid/{uuid}/progress/{progressId}
     *
     * Hapus SATU catatan tb_progress beserta lampirannya. Selalu di-resolve
     * dari uuid_project + id_project di URL, jadi progress projek lain tidak
     * pernah bisa dihapus lewat projek ini (anti-IDOR).
     *
     * Strategi konsistensi (filesystem tidak ikut rollback transaksi):
     *   - Record progress & record tb_files dihapus di dalam SATU transaksi DB.
     *   - File fisik dihapus SETELAH commit. Urutan ini memastikan DB tidak
     *     pernah menunjuk file yang sudah hilang; kegagalan hapus fisik hanya
     *     menyisakan file yatim (dilaporkan, bukan disembunyikan), bukan
     *     lampiran yang rusak.
     *   - File yang masih direferensikan progress LAIN (projek sama / berbeda)
     *     tidak dihapus record maupun fisiknya - hanya dilepas dari progress
     *     yang dihapus.
     *   - File dengan id_parent projek lain tidak pernah disentuh.
     */
    public function deleteProgress(string $uuid, int $progressId): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project || !$this->canAccessProject($project)) {
            return $this->notFound();
        }

        $projectId = (int) $project->id_project;

        // 1-2. Progress harus ada DAN milik projek ini.
        $progress = DB::table('tb_progress')
            ->where('id', $progressId)
            ->where('id_project', $projectId)
            ->first();

        if (!$progress) {
            return response()->json([
                'status' => 'error',
                'message' => 'Progress tidak ditemukan.',
            ], 404);
        }

        // 3-4. Parse kolom id_file (JSON array; toleran nilai lama) -> ID file.
        $fileIds = $this->parseFileIds($progress->id_file ?? null);

        // 5-6. Ambil HANYA record file yang benar-benar milik projek ini.
        $ownedFiles = [];
        if (!empty($fileIds)) {
            $ownedFiles = DB::table('tb_files')
                ->whereIn('id', $fileIds)
                ->where('id_parent', $projectId)
                ->get()
                ->keyBy('id')
                ->all();
        }

        // 5b. File yang masih dipakai progress lain tidak boleh dihapus.
        $referencedElsewhere = $this->fileIdsReferencedByOtherProgress($progressId);

        $deletableFiles = [];
        $keptFiles = [];
        foreach ($ownedFiles as $fileId => $file) {
            $fileId = (int) $fileId;
            if (isset($referencedElsewhere[$fileId])) {
                // Hanya lepas referensi (progress dihapus), record & file tetap.
                $keptFiles[] = $fileId;
                continue;
            }
            $deletableFiles[] = $file;
        }

        // 7-8. Hapus record progress + record file dalam satu transaksi.
        try {
            DB::beginTransaction();

            DB::table('tb_progress')->where('id', $progressId)->delete();

            $deletableIds = array_map(fn ($file) => (int) $file->id, $deletableFiles);
            if (!empty($deletableIds)) {
                DB::table('tb_files')->whereIn('id', $deletableIds)->delete();
            }

            DB::commit();
        } catch (\Throwable $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

            return $this->writeFailed('Gagal menghapus progress.');
        }

        // 9. Baru setelah commit: hapus file fisik (best-effort + dilaporkan).
        //    Path dipetakan lewat resolveStoredPath() sehingga tetap di dalam
        //    direktori yang diizinkan (anti traversal / path sembarang).
        $disk = Storage::disk(config('elmech.project_file.disk', 'public'));
        $filesDeleted = [];
        $filesFailed = [];

        foreach ($deletableFiles as $file) {
            $fileId = (int) $file->id;

            try {
                $relativePath = $this->resolveStoredPath((string) $file->path);

                // Path tak terpetakan / file sudah tidak ada = aman (record
                // sudah terhapus, tidak ada lagi yang perlu dibersihkan).
                if ($relativePath === null || !$disk->exists($relativePath)) {
                    continue;
                }

                if (!$disk->delete($relativePath)) {
                    $filesFailed[] = ['id' => $fileId, 'reason' => 'delete_failed'];
                    continue;
                }

                $filesDeleted[] = $fileId;
            } catch (\Throwable $e) {
                $filesFailed[] = ['id' => $fileId, 'reason' => 'delete_failed'];
            }
        }

        $message = 'Progress berhasil dihapus.';
        if (!empty($filesFailed)) {
            // Jangan diam-diam menganggap sukses penuh: laporkan file yatim.
            $message = 'Progress berhasil dihapus, tetapi sebagian file gagal dibersihkan dari storage.';
        }

        return response()->json([
            'status' => 'ok',
            'message' => $message,
            'data' => [
                'id' => (int) $progressId,
                'deleted_files' => $filesDeleted,
                'kept_files' => $keptFiles,
                'files_failed' => $filesFailed,
            ],
        ], 200);
    }

    /**
     * Kumpulkan ID file yang masih direferensikan progress SELAIN
     * $excludeProgressId (projek sama maupun berbeda). Dipakai sebelum
     * menghapus record/file agar lampiran yang dipakai bersama tidak ikut
     * terhapus.
     *
     * @return array<int,bool>
     */
    private function fileIdsReferencedByOtherProgress(int $excludeProgressId): array
    {
        $referenced = [];

        $rows = DB::table('tb_progress')
            ->where('id', '!=', $excludeProgressId)
            ->pluck('id_file');

        foreach ($rows as $value) {
            foreach ($this->parseFileIds($value) as $id) {
                $referenced[$id] = true;
            }
        }

        return $referenced;
    }

    /**
     * Ubah satu row tb_progress (+ lampirannya) menjadi payload API.
     *
     * Lampiran diambil dari tb_files berdasarkan ID di kolom id_file, tetapi
     * HANYA baris yang id_parent-nya sama dengan project ini. Urutan mengikuti
     * isi id_file.
     */
    private function presentProgress(object $row, int $projectId, $disk): array
    {
        $ids = $this->parseFileIds($row->id_file ?? null);
        $attachments = [];

        if (!empty($ids)) {
            $files = DB::table('tb_files')
                ->whereIn('id', $ids)
                ->where('id_parent', $projectId)
                ->get()
                ->keyBy('id');

            foreach ($ids as $fileId) {
                $file = $files->get($fileId);
                if ($file) {
                    $attachments[] = $this->presentFile($file, $disk);
                }
            }
        }

        return [
            'id' => (int) $row->id,
            'progress' => (int) $row->progress,
            'deskripsi' => (string) $row->deskripsi,
            'created_at' => $row->created_at,
            'files' => $attachments,
        ];
    }

    /**
     * GET /api/projects/uuid/{uuid}/pembayaran
     *
     * Ringkasan keuangan + seluruh riwayat transaksi tb_pembayaran milik satu
     * projek. Projek selalu di-resolve dari uuid_project; id_project tidak
     * pernah diterima dari client.
     *
     * Catatan: tb_pembayaran hanya punya 5 kolom (id_pembayaran, id_project,
     * nominal, bukti_tf, pelunasan) - TIDAK ada kolom tanggal. Riwayat karena
     * itu diurutkan dari id terbesar (transaksi terbaru lebih dulu) dan tidak
     * ada tanggal yang difabrikasi.
     */
    public function getPembayaran(string $uuid): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project) {
            return $this->notFound();
        }

        $disk = Storage::disk(config('elmech.project_file.disk', 'public'));

        return response()->json([
            'status' => 'ok',
            'data' => $this->presentPembayaran($project, $disk),
        ], 200);
    }

    /**
     * POST /api/projects/uuid/{uuid}/pembayaran
     *
     * Tambah satu transaksi pembayaran (dp/lunas) + bukti transfer opsional.
     *
     * Aturan:
     *  - nominal integer > 0, maksimum sesuai int(11).
     *  - 'lunas' HANYA boleh bila nominal TEPAT sama dengan sisa biaya
     *    (harga - total pembayaran existing); ini yang membuat pilihan 'lunas'
     *    benar-benar berarti projek lunas. Validasi final dijalankan di dalam
     *    transaksi dengan mengunci baris projek supaya dua request bersamaan
     *    tidak menghasilkan nilai yang tidak konsisten.
     *  - Bukti transfer (jpg/jpeg/png/pdf) ditulis lebih dulu; bila INSERT
     *    gagal, file baru dibersihkan agar tidak menjadi yatim.
     */
    public function addPembayaran(Request $request, string $uuid): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project) {
            return $this->notFound();
        }

        $config = config('elmech.project_payment');
        $allowedMimes = $config['mimes'] ?? ['jpg', 'jpeg', 'png', 'pdf'];
        $maxKb = (int) ($config['max_kb'] ?? 4096);
        $diskName = $config['disk'] ?? 'public';
        $directory = trim($config['directory'] ?? 'project-files', '/');

        $validated = $request->validate([
            'pelunasan' => ['required', Rule::in(['dp', 'lunas'])],
            'nominal' => ['required', 'integer', 'min:1', 'max:2000000000'],
            'bukti' => ['nullable', 'file', 'max:' . $maxKb],
        ], [
            'pelunasan.required' => 'Jenis pembayaran wajib dipilih.',
            'pelunasan.in' => 'Jenis pembayaran harus DP atau Lunas.',
            'nominal.required' => 'Nominal pembayaran wajib diisi.',
            'nominal.integer' => 'Nominal pembayaran harus berupa angka bulat.',
            'nominal.min' => 'Nominal pembayaran harus lebih besar dari nol.',
            'nominal.max' => 'Nominal pembayaran terlalu besar.',
            'bukti.file' => 'Bukti transfer tidak valid.',
            'bukti.max' => 'Ukuran bukti transfer maksimal ' . ($maxKb / 1024) . ' MB.',
        ]);

        $jenis = $validated['pelunasan'];
        $nominal = (int) $validated['nominal'];

        // Validasi tipe bukti berbasis MIME asli (bukan nama file) sebelum
        // menulis apa pun ke disk.
        $file = $request->file('bukti');
        if ($file) {
            if (!$file->isValid()) {
                throw ValidationException::withMessages([
                    'bukti' => ['Bukti transfer gagal diunggah.'],
                ]);
            }

            $extension = strtolower($file->guessExtension() ?: '');
            if ($extension === '' || !in_array($extension, $allowedMimes, true)) {
                throw ValidationException::withMessages([
                    'bukti' => [
                        'Format bukti transfer tidak diizinkan. Format yang diperbolehkan: JPG, JPEG, PNG, PDF.',
                    ],
                ]);
            }
        }

        $disk = Storage::disk($diskName);
        $writtenPaths = [];

        try {
            DB::beginTransaction();

            // Kunci baris projek: serialisasi penambahan pembayaran per projek
            // sehingga sisa biaya selalu dihitung dari data terbaru.
            DB::table('tb_project')
                ->where('id_project', $project->id_project)
                ->lockForUpdate()
                ->first();

            $harga = (int) $project->harga;
            $total = (int) DB::table('tb_pembayaran')
                ->where('id_project', $project->id_project)
                ->sum('nominal');
            $sisa = max(0, $harga - $total);

            if ($jenis === 'lunas' && $nominal !== $sisa) {
                throw ValidationException::withMessages([
                    'nominal' => [
                        $nominal > $sisa
                            ? 'Nominal Lunas tidak boleh melebihi sisa biaya (Rp ' . number_format($sisa, 0, ',', '.') . ').'
                            : 'Nominal Lunas harus sama dengan sisa biaya (Rp ' . number_format($sisa, 0, ',', '.') . ').',
                    ],
                ]);
            }

            // Simpan bukti transfer (opsional). Yang disimpan adalah URL, bukan
            // binary, dan file fisik memakai mekanisme project-file yang sudah
            // ada (tb_files tidak disentuh - bukti_tf kolom sendiri).
            $buktiUrl = '';
            if ($file) {
                $extension = strtolower($file->guessExtension() ?: 'bin');
                $filename = $this->randomFileName($extension);
                $relativePath = $directory . '/' . $filename;

                $stream = fopen($file->getRealPath(), 'rb');
                $stored = $stream !== false && $disk->put($relativePath, $stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }
                if (!$stored) {
                    throw new \RuntimeException('Gagal menyimpan bukti transfer.');
                }

                $writtenPaths[] = $relativePath;
                $buktiUrl = $this->publicFileUrl($filename);
            }

            DB::table('tb_pembayaran')->insert([
                'id_project' => $project->id_project,
                'nominal' => $nominal,
                'bukti_tf' => $buktiUrl,
                'pelunasan' => $jenis,
            ]);

            DB::commit();
        } catch (ValidationException $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->cleanupFiles($disk, $writtenPaths);

            throw $e;
        } catch (\Throwable $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $this->cleanupFiles($disk, $writtenPaths);

            return $this->writeFailed('Gagal menyimpan pembayaran.');
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Pembayaran berhasil disimpan.',
            'data' => $this->presentPembayaran($project, $disk),
        ], 201);
    }

    /**
     * Ringkasan pembayaran + riwayat satu projek (dipakai GET & respons POST).
     * Semua angka dihitung dari baris tb_pembayaran yang sebenarnya; tidak ada
     * state frontend yang dipercaya dan tidak ada kolom status tambahan.
     */
    private function presentPembayaran(Project $project, $disk): array
    {
        $harga = (int) $project->harga;

        // Transaksi terbaru lebih dulu: tb_pembayaran tidak menyimpan tanggal,
        // jadi id_pembayaran (auto increment) menjadi urutan yang deterministik.
        $rows = DB::table('tb_pembayaran')
            ->where('id_project', $project->id_project)
            ->orderByDesc('id_pembayaran')
            ->get();

        $total = 0;
        $lunasCount = 0;
        $dpCount = 0;
        $pembayaran = [];

        foreach ($rows as $row) {
            $nominal = (int) $row->nominal;
            $total += $nominal;

            if ($row->pelunasan === 'lunas') {
                $lunasCount++;
            } elseif ($row->pelunasan === 'dp') {
                $dpCount++;
            }

            $pembayaran[] = [
                'id' => (int) $row->id_pembayaran,
                'nominal' => $nominal,
                'bukti_tf' => (string) $row->bukti_tf,
                'bukti_url' => $this->fileUrlOnDisk($disk, $row->bukti_tf),
                'pelunasan' => $row->pelunasan,
            ];
        }

        return [
            'harga' => $harga,
            'total_pembayaran' => $total,
            'sisa' => max(0, $harga - $total),
            'kelebihan' => max(0, $total - $harga),
            'pelunasan' => $this->resolvePelunasan($lunasCount, $dpCount),
            'pembayaran' => $pembayaran,
            // tb_pembayaran tidak punya kolom tanggal: jangan mengarang.
            'has_transaction_date' => false,
        ];
    }

    /**
     * DELETE /api/projects/uuid/{uuid}/pembayaran/{paymentId}
     *
     * Hapus SATU transaksi tb_pembayaran milik projek yang sedang dibuka,
     * beserta file bukti transfernya bila file itu eksklusif (tidak dipakai
     * transaksi lain / fitur lain).
     *
     * Urutan aman:
     *   1-3. Transaksi harus ada DAN id_project-nya cocok dengan projek dari
     *        uuid di URL. id_project dari client tidak pernah dipercaya.
     *   4.   Rencanakan nasib file SEBELUM menghapus apa pun (read-only check):
     *        tak ada bukti / tak terpetakan (di luar storage) / dipakai data
     *        lain / sudah hilang / boleh dihapus.
     *   5.   Hapus record di dalam transaksi DB (file tidak disentuh lebih dulu,
     *        sehingga DB tidak pernah menunjuk file yang sudah terhapus).
     *   6.   Setelah commit, baru hapus file fisik (best-effort + dilaporkan).
     */
    public function deletePembayaran(string $uuid, int $paymentId): JsonResponse
    {
        $project = Project::where('uuid_project', $uuid)->first();

        if (!$project) {
            return $this->notFound();
        }

        $projectId = (int) $project->id_project;

        // 1-3. Transaksi harus ada dan benar-benar milik projek ini. Baris milik
        //      projek lain menghasilkan 404 dan tidak tersentuh.
        $payment = DB::table('tb_pembayaran')
            ->where('id_pembayaran', $paymentId)
            ->where('id_project', $projectId)
            ->first();

        if (!$payment) {
            return response()->json([
                'status' => 'error',
                'message' => 'Pembayaran tidak ditemukan.',
            ], 404);
        }

        $disk = Storage::disk(config('elmech.project_file.disk', 'public'));
        $bukti = trim((string) ($payment->bukti_tf ?? ''));

        // 4. Rencana file dihitung sebelum record dihapus.
        $filePlan = 'none';       // tidak ada bukti transfer
        $relativePath = null;

        if ($bukti !== '') {
            $relativePath = $this->resolveStoredPath($bukti);

            if ($relativePath === null) {
                // URL/format di luar storage aplikasi -> jangan pernah sentuh.
                $filePlan = 'unmappable';
            } elseif ($this->proofPathReferencedElsewhere($bukti, $paymentId)) {
                // Masih dipakai transaksi lain / fitur lain -> simpan filenya.
                $filePlan = 'kept';
            } elseif (!$disk->exists($relativePath)) {
                // File sudah tidak ada -> tidak ada yang perlu dibersihkan.
                $filePlan = 'missing';
            } else {
                $filePlan = 'delete';
            }
        }

        // 5. Hapus record dulu, di dalam transaksi.
        try {
            DB::beginTransaction();
            DB::table('tb_pembayaran')->where('id_pembayaran', $paymentId)->delete();
            DB::commit();
        } catch (\Throwable $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

            return $this->writeFailed('Gagal menghapus pembayaran.');
        }

        // 6. Setelah commit: hapus file fisik (anti path traversal lewat
        //    resolveStoredPath; hanya direktori storage aplikasi).
        $fileDeleted = false;
        $fileFailed = false;

        if ($filePlan === 'delete' && $relativePath !== null) {
            try {
                if ($disk->delete($relativePath)) {
                    $fileDeleted = true;
                } else {
                    $fileFailed = true;
                }
            } catch (\Throwable $e) {
                $fileFailed = true;
            }
        }

        $message = 'Pembayaran berhasil dihapus.';
        if ($fileFailed) {
            // Jangan melaporkan sukses penuh: file bukti masih tertinggal dan
            // perlu dibersihkan (dilaporkan eksplisit ke frontend).
            $message = 'Pembayaran berhasil dihapus, tetapi file bukti transfer gagal dibersihkan dari storage.';
        }

        return response()->json([
            'status' => 'ok',
            'message' => $message,
            'data' => [
                'id' => $paymentId,
                'file_deleted' => $fileDeleted,
                'file_referenced' => $filePlan === 'kept',
                'file_failed' => $fileFailed,
                // Ringkasan terbaru agar frontend tidak perlu reload manual.
                'summary' => $this->presentPembayaran($project, $disk),
            ],
        ], 200);
    }

    /**
     * Apakah file bukti ($stored) masih direferensikan data LAIN.
     *
     * Dicek ke:
     *   - baris tb_pembayaran lain (URL sama), dan
     *   - tb_files (file projek / lampiran progress) yang menunjuk file fisik
     *     yang sama (dibandingkan dari nama file),
     * sehingga file yang dipakai bersama tidak ikut terhapus.
     *
     * File yang tidak bisa dipetakan ke storage dianggap "terpakai" supaya
     * tidak pernah dihapus.
     */
    private function proofPathReferencedElsewhere(string $stored, int $excludePaymentId): bool
    {
        $value = trim($stored);
        if ($value === '') {
            return false;
        }

        $usedByPayment = DB::table('tb_pembayaran')
            ->where('id_pembayaran', '!=', $excludePaymentId)
            ->where('bukti_tf', $value)
            ->exists();

        if ($usedByPayment) {
            return true;
        }

        $relative = $this->resolveStoredPath($value);
        if ($relative === null) {
            return true;
        }

        $name = basename($relative);
        if ($name === '') {
            return false;
        }

        // Nama file fisik unik (hex acak) sehingga LIKE '%<nama>%' aman dan
        // tetap menangkap path lama/absolut. Wildcard di-escape.
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $name);

        return DB::table('tb_files')->where('path', 'like', '%' . $escaped . '%')->exists();
    }

    /**
     * Payload satu file tb_files untuk preview/download di frontend.
     */
    private function presentFile(object $file, $disk): array
    {
        $stored = (string) $file->path;
        $name = basename((string) parse_url($stored, PHP_URL_PATH) ?: $stored);
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $exists = $this->fileExistsOnDisk($disk, $stored);
        $size = $exists ? $this->fileSizeOnDisk($disk, $stored) : null;

        return [
            'id' => (int) $file->id,
            'name' => $name,
            'extension' => $ext,
            'size' => $size,
            'size_human' => $size !== null ? $this->formatBytes($size) : 'Unknown',
            'datetime' => $file->datetime,
            'url' => $this->fileUrlOnDisk($disk, $stored),
            'can_preview' => in_array($ext, ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt'], true),
            'exists' => $exists,
        ];
    }

    /**
     * tb_progress.id_file menyimpan JSON array ID tb_files (contoh "[676,677]").
     * Toleran terhadap nilai kosong/NULL maupun daftar dipisah koma dari data
     * lama; selalu mengembalikan array integer unik.
     *
     * @return int[]
     */
    private function parseFileIds($value): array
    {
        if ($value === null) {
            return [];
        }

        $raw = trim((string) $value);
        if ($raw === '' || strtolower($raw) === 'null') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $ids = [];
            foreach ($decoded as $id) {
                if (is_numeric($id)) {
                    $ids[] = (int) $id;
                }
            }

            return array_values(array_unique($ids));
        }

        // Kompatibilitas: nilai lama bisa berupa daftar dipisah koma.
        $ids = [];
        foreach (explode(',', $raw) as $part) {
            $part = trim($part, " \t\n\r\0\x0B[]\"'");
            if ($part !== '' && is_numeric($part)) {
                $ids[] = (int) $part;
            }
        }

        return array_values(array_unique($ids));
    }

    /**
     * Hapus file fisik yang BARU ditulis pada operasi ini saja (rollback DB).
     * Tidak pernah menyentuh file lain / milik progress lain.
     *
     * @param string[] $paths
     */
    private function cleanupFiles($disk, array $paths): void
    {
        foreach ($paths as $path) {
            try {
                if ($disk->exists($path)) {
                    $disk->delete($path);
                }
            } catch (\Throwable $e) {
                // Cleanup best-effort: jangan menutupi error utama.
            }
        }
    }

    /**
     * Nama file fisik unik (acak kriptografis) + ekstensi yang sudah divalidasi.
     * Tidak pernah memakai nama asli pengguna. Mengulang bila (sangat kecil)
     * kemungkinannya sudah ada di disk agar tidak bentrok.
     */
    private function randomFileName(string $extension): string
    {
        $disk = Storage::disk(config('elmech.project_file.disk', 'public'));
        $directory = trim(config('elmech.project_file.directory', 'project-files'), '/');

        do {
            $name = bin2hex(random_bytes(16)) . '.' . $extension;
        } while ($disk->exists($directory . '/' . $name));

        return $name;
    }

    /**
     * Full URL publik untuk sebuah nama file: "<base_url>/files/<nama>".
     * Domain berasal dari konfigurasi elmech.project_file_url (default APP_URL).
     */
    private function publicFileUrl(string $filename): string
    {
        $base = rtrim((string) config('elmech.project_file_url.base_url', config('app.url')), '/');
        $prefix = trim((string) config('elmech.project_file_url.prefix', 'files'), '/');

        return $base . '/' . $prefix . '/' . $filename;
    }

    /**
     * Nama file aman -> path relatif di dalam direktori file projek.
     * Menolak traversal ("/", "\", "..") atau nama kosong.
     */
    private function projectFileName(string $name): ?string
    {
        $name = trim($name);

        if (
            $name === '' || $name === '.' || $name === '..'
            || str_contains($name, '/') || str_contains($name, '\\')
        ) {
            return null;
        }

        $directory = trim(config('elmech.project_file.directory', 'project-files'), '/');

        return $directory . '/' . $name;
    }

    /**
     * Map nilai tb_files.path ke path fisik relatif pada disk.
     *
     * Mendukung:
     *   - format baru : full URL "http(s)://<domain>/files/<nama>"
     *   - kompatibilitas: full URL "/storage/<dir>/<nama>"
     *   - format lama : path relatif "project-files/<nama>"
     *
     * Mengembalikan null bila nilai tidak bisa dipetakan dengan aman ke dalam
     * direktori yang diizinkan (mencegah penghapusan/pembacaan di luar folder).
     */
    private function resolveStoredPath(?string $stored): ?string
    {
        if ($stored === null) {
            return null;
        }

        $value = trim($stored);
        if ($value === '') {
            return null;
        }

        $directory = trim(config('elmech.project_file.directory', 'project-files'), '/');
        $prefix = trim(config('elmech.project_file_url.prefix', 'files'), '/');

        if (preg_match('#^https?://#i', $value)) {
            $path = ltrim((string) parse_url($value, PHP_URL_PATH), '/');

            if (str_starts_with($path, $prefix . '/')) {
                return $this->projectFileName(substr($path, strlen($prefix) + 1));
            }

            $storagePrefix = 'storage/' . $directory . '/';
            if (str_starts_with($path, $storagePrefix)) {
                return $this->projectFileName(substr($path, strlen($storagePrefix)));
            }

            return null;
        }

        $normalized = ltrim(str_replace('\\', '/', $value), '/');
        if (str_contains($normalized, '..') || !str_starts_with($normalized, $directory . '/')) {
            return null;
        }

        return $normalized;
    }

    private function fileExistsOnDisk($disk, ?string $stored): bool
    {
        $relative = $this->resolveStoredPath($stored);

        return $relative !== null && $disk->exists($relative);
    }

    private function fileSizeOnDisk($disk, ?string $stored): ?int
    {
        $relative = $this->resolveStoredPath($stored);
        if ($relative === null || !$disk->exists($relative)) {
            return null;
        }

        try {
            return $disk->size($relative);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function fileUrlOnDisk($disk, ?string $stored): ?string
    {
        // Format baru: simpan full URL apa adanya.
        if ($stored !== null && preg_match('#^https?://#i', trim($stored))) {
            return trim($stored);
        }

        $relative = $this->resolveStoredPath($stored);

        return $relative !== null ? $disk->url($relative) : null;
    }

    // ------------------------------------------------------------------ helpers

    /**
     * Shared validation for store & update (full-update semantics, same as
     * UserManagementController::update - every writable field is validated).
     */
    private function validateProject(Request $request): array
    {
        return $request->validate([
            // Kode projek. Kosong -> dibuatkan acak 30 karakter (format yang
            // dipakai baris existing), max:30 mengikuti varchar(30).
            'uuid_project' => ['nullable', 'string', 'max:30'],
            // WAJIB user yang ada: FK tb_project_ibfk_1.
            'id_client' => ['required', 'integer', Rule::exists('tb_user', 'id_user')],
            'judul' => ['required', 'string', 'max:500'],
            // Jenis projek: opsional - database akan menggunakan default 'project'.
            'jenis' => ['nullable', 'string', Rule::in(self::VALID_JENIS)],
            // Kolom NOT NULL: null/absen disimpan sebagai '' (pola yang sama
            // dipakai UserManagementController untuk foto/id_telegram).
            'deskripsi' => ['nullable', 'string'],
            // Kolom tanggal: mulai & estimasi wajib; selesai opsional.
            'tanggal_mulai' => ['required', 'date'],
            'tanggal_estimasi' => ['required', 'date'],
            'tanggal_selesai' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'status' => ['required', 'string', Rule::in(self::VALID_STATUS)],
            'urgency' => ['required', 'string', Rule::in(self::VALID_URGENCY)],
            // Kolom NOT NULL: null/absen disimpan sebagai 0.
            'harga' => ['nullable', 'integer', 'min:0'],
            'is_proposed' => ['sometimes', 'boolean'],
            // Worker hanya sebagai daftar id tb_user yang ada; disimpan ke
            // tb_tim (bukan ke tb_project). Kosong = tanpa worker, tetap sah.
            'worker_ids' => ['nullable', 'array'],
            'worker_ids.*' => ['integer', Rule::exists('tb_user', 'id_user')],
        ], [
            'uuid_project.max' => 'Kode projek maksimal 30 karakter.',
            'id_client.required' => 'Client wajib dipilih.',
            'id_client.exists' => 'Client yang dipilih tidak tersedia.',
            'judul.required' => 'Judul projek wajib diisi.',
            'judul.max' => 'Judul projek maksimal 500 karakter.',
            'jenis.in' => 'Jenis projek tidak valid.',
            'tanggal_mulai.required' => 'Tanggal mulai wajib diisi.',
            'tanggal_estimasi.required' => 'Tanggal estimasi wajib diisi.',
            'tanggal_selesai.after_or_equal' => 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
            'status.required' => 'Status wajib dipilih.',
            'status.in' => 'Status projek tidak valid.',
            'urgency.required' => 'Urgency wajib dipilih.',
            'urgency.in' => 'Urgency tidak valid.',
            'harga.min' => 'Harga tidak boleh negatif.',
            'worker_ids.array' => 'Daftar worker tidak valid.',
            'worker_ids.*.exists' => 'Salah satu worker yang dipilih tidak tersedia.',
        ]);
    }

    /**
     * Field-by-field whitelist into the EXISTING columns. Nothing outside
     * this block is writable - id_project can never be set from the client.
     */
    private function fillProject(Project $project, array $validated, Request $request): void
    {
        $project->uuid_project = trim((string) ($validated['uuid_project'] ?? ''));
        if ($project->uuid_project === '') {
            $project->uuid_project = Str::random(30);
        }
        $project->id_client = (int) $validated['id_client'];
        $project->judul = $validated['judul'];
        // Hanya update jenis jika disediakan (create: pakai default DB, edit: pertahankan existing).
        if (array_key_exists('jenis', $validated)) {
            $project->jenis = $validated['jenis'] ?? self::DEFAULT_JENIS;
        }
        $project->deskripsi = (string) ($validated['deskripsi'] ?? '');
        $project->tanggal_mulai = $validated['tanggal_mulai'];
        $project->tanggal_estimasi = $validated['tanggal_estimasi'];
        // Tanggal selesai opsional: jika tidak diisi, gunakan tanggal estimasi sebagai fallback
        // (kolom NOT NULL di DB, strict mode tidak menerima '0000-00-00').
        $project->tanggal_selesai = $validated['tanggal_selesai'] ?? $validated['tanggal_estimasi'];
        $project->status = $validated['status'];
        $project->urgency = $validated['urgency'];
        $project->harga = (int) ($validated['harga'] ?? 0);
        $project->is_proposed = $request->boolean('is_proposed');
    }

    /**
     * Replace relasi tb_tim milik project ini dengan daftar worker baru.
     * Hanya baris milik id_project ini yang dihapus - project lain tidak
     * tersentuh. Dipanggil di dalam transaction oleh store()/update().
     */
    private function syncTeam(Project $project, array $workerIds): void
    {
        DB::table('tb_tim')->where('id_project', $project->id_project)->delete();

        $ids = array_values(array_unique(array_map(
            fn ($id) => (int) $id,
            array_filter($workerIds, fn ($id) => is_numeric($id))
        )));
        if ($ids === []) {
            return;
        }

        DB::table('tb_tim')->insert(array_map(
            fn (int $idWorker) => [
                'id_project' => $project->id_project,
                'id_worker' => $idWorker,
            ],
            $ids
        ));
    }

    /**
     * Status pelunasan dari agregat tb_pembayaran (prioritas lunas > dp):
     *  - minimal satu 'lunas' -> 'lunas'
     *  - selain itu minimal satu 'dp' -> 'dp'
     *  - tanpa record -> 'belum_bayar'
     *
     * Terpisah dari tb_project.status (running/done/cancel) - keduanya
     * tidak pernah dicampur. Enum DB (dp/lunas) tidak diubah.
     */
    private function resolvePelunasan(int $lunasCount, int $dpCount): string
    {
        if ($lunasCount > 0) {
            return 'lunas';
        }
        if ($dpCount > 0) {
            return 'dp';
        }
        return 'belum_bayar';
    }

    /**
     * The only place a project row is turned into an API payload.
     *
     * Besides the raw columns it carries frontend-friendly aliases
     * (id/code/name/customer/description/startDate/endDate) so the UI does
     * not have to rename database fields. Legacy zero-dates ('0000-00-00')
     * are mapped to null - never fabricated, never written back.
     *
     * Agregat pembayaran dibaca dari relasi yang di-eager-load bila ada,
     * else dari atribut subquery withCount/withSum (jalur index) - tidak
     * pernah query per-baris (tanpa N+1).
     */
    private function present(Project $project): array
    {
        $workers = [];
        $pembayaran = [];
        if ($project->relationLoaded('team')) {
            foreach ($project->team as $row) {
                $worker = $row->worker;
                $workerData = [
                    'id' => (int) $row->id_worker,
                    'nama' => $worker ? $worker->nama : null,
                ];
                if ($worker) {
                    $workerData['foto'] = $worker->foto;
                    $workerData['foto_url'] = $worker->fotoUrl();
                }
                $workers[] = $workerData;
            }
        }

        if ($project->relationLoaded('pembayaran')) {
            $lunasCount = 0;
            $dpCount = 0;
            $total = 0;
            foreach ($project->pembayaran as $bayar) {
                $total += (int) $bayar->nominal;
                if ($bayar->pelunasan === 'lunas') {
                    $lunasCount++;
                } elseif ($bayar->pelunasan === 'dp') {
                    $dpCount++;
                }
                $pembayaran[] = [
                    'id' => (int) $bayar->id_pembayaran,
                    'nominal' => (int) $bayar->nominal,
                    'bukti_tf' => $bayar->bukti_tf,
                    'pelunasan' => $bayar->pelunasan,
                ];
            }
        } else {
            $lunasCount = (int) ($project->lunas_count ?? 0);
            $dpCount = (int) ($project->dp_count ?? 0);
            $total = (int) ($project->total_pembayaran ?? 0);
        }

        $clientData = null;
        if ($project->client) {
            $clientData = [
                'nama' => $project->client->nama,
                'foto' => $project->client->foto,
                'foto_url' => $project->client->fotoUrl(),
                // Kontak customer langsung dari tb_user; null bila kosong
                // (tidak pernah difabrikasi di sisi API).
                'alamat' => $project->client->alamat,
                'no_hp' => $project->client->no_hp,
            ];
        }

        return [
            'id' => (int) $project->id_project,
            'uuid' => $project->uuid_project,
            'code' => $project->uuid_project,
            'id_client' => (int) $project->id_client,
            'client' => $clientData,
            'judul' => $project->judul,
            'name' => $project->judul,
            'jenis' => $project->jenis,
            'deskripsi' => (string) $project->deskripsi,
            'description' => (string) $project->deskripsi,
            'tanggal_mulai' => $this->dateOnly($project->tanggal_mulai),
            'startDate' => $this->dateOnly($project->tanggal_mulai),
            'tanggal_estimasi' => $this->dateOnly($project->tanggal_estimasi),
            'estimasiDate' => $this->dateOnly($project->tanggal_estimasi),
            'tanggal_selesai' => $this->dateOnly($project->tanggal_selesai),
            'endDate' => $this->dateOnly($project->tanggal_selesai),
            'status' => $project->status,
            'urgency' => $project->urgency,
            'harga' => (int) $project->harga,
            'is_proposed' => (bool) $project->is_proposed,
            // Agregat pembayaran (bukan kolom tb_project).
            'pelunasan' => $this->resolvePelunasan($lunasCount, $dpCount),
            'total_pembayaran' => $total,
            // Daftar worker (jalur detail) + daftar pembayaran (jalur detail).
            'workers' => $workers,
            'pembayaran' => $pembayaran,
        ];
    }

    /**
     * Client options straight from tb_user (the id_client FK target), with a
     * live project count so the dropdown can never drift from the database.
     */
    private function clientOptions(): array
    {
        $rows = User::query()
            ->leftJoin('tb_project', 'tb_project.id_client', '=', 'tb_user.id_user')
            ->select('tb_user.id_user', 'tb_user.nama', DB::raw('COUNT(tb_project.id_project) AS projects_count'))
            ->groupBy('tb_user.id_user', 'tb_user.nama')
            ->orderBy('tb_user.nama')
            ->get();

        return $rows->map(fn ($row) => [
            'id' => (int) $row->id_user,
            'nama' => $row->nama,
            'projects_count' => (int) $row->projects_count,
        ])->all();
    }

    /**
     * Escape the LIKE wildcards so a user typing "100%" or "a_b" searches for
     * those literal characters instead of turning them into patterns.
     */
    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    private function dateOnly($value): ?string
    {
        if ($value === null || $value === '' || $value === '0000-00-00') {
            return null;
        }

        // Always YYYY-MM-DD. Sending a date-only string avoids the timezone
        // shift that would otherwise turn 2023-07-30 into Jul 29 in the browser.
        return substr((string) $value, 0, 10);
    }

    /**
     * Format bytes into human readable string.
     */
    private function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $factor = floor((strlen((string) $bytes) - 1) / 3);
        if ($factor === 0) {
            return $bytes . ' ' . $units[0];
        }
        return sprintf('%.2f %s', $bytes / (1024 ** $factor), $units[$factor]);
    }

    /**
     * Apakah user yang login adalah admin (level 1)? Role dibaca dari sesi
     * autentikasi Laravel (tb_user.id_level), TIDAK pernah dari parameter/body
     * yang dikirim klien.
     */
    private function isAdminUser(): bool
    {
        $user = Auth::user();

        return $user !== null
            && in_array((int) $user->id_level, self::ADMIN_LEVEL_IDS, true);
    }

    /** id_user user yang login (0 bila tidak ada sesi). */
    private function currentUserId(): int
    {
        $user = Auth::user();

        return $user !== null ? (int) $user->id_user : 0;
    }

    /**
     * Apakah user yang login boleh MELIHAT projek ini?
     *   - admin (level 1) : seluruh projek.
     *   - selain admin    : hanya projek yang terhubung lewat tb_tim
     *     (tb_tim.id_project = projek, tb_tim.id_worker = user login).
     *
     * Identitas user selalu dari sesi; id_project/id_worker dari klien tidak
     * pernah dipakai sebagai dasar otorisasi.
     */
    private function canAccessProject(Project $project): bool
    {
        if ($this->isAdminUser()) {
            return true;
        }

        $userId = $this->currentUserId();
        if ($userId <= 0) {
            return false;
        }

        return DB::table('tb_tim')
            ->where('id_project', (int) $project->id_project)
            ->where('id_worker', $userId)
            ->exists();
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'status' => 'error',
            'message' => 'Projek tidak ditemukan.',
        ], 404);
    }

    private function writeFailed(string $message): JsonResponse
    {
        return response()->json([
            'status' => 'error',
            'message' => $message,
        ], 500);
    }
}
