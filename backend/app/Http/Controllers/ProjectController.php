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

        // Filter pelunasan memakai logika yang sama dengan present():
        // lunas = minimal satu baris 'lunas'; dp = ada 'dp' tanpa 'lunas';
        // belum_bayar = tanpa baris pembayaran sama sekali.
        // whereHas/whereDoesntHave = subquery EXISTS: satu project tidak
        // pernah ganda walau punya banyak baris tb_pembayaran.
        $pelunasan = $request->query('pelunasan');
        if ($pelunasan !== null && $pelunasan !== '' && $pelunasan !== 'all') {
            if (!in_array($pelunasan, ['lunas', 'dp', 'belum_bayar'], true)) {
                throw ValidationException::withMessages([
                    'pelunasan' => ['Filter pelunasan tidak valid.'],
                ]);
            }
            if ($pelunasan === 'lunas') {
                $query->whereHas('pembayaran', fn ($q) => $q->where('pelunasan', 'lunas'));
            } elseif ($pelunasan === 'dp') {
                $query->whereHas('pembayaran', fn ($q) => $q->where('pelunasan', 'dp'))
                    ->whereDoesntHave('pembayaran', fn ($q) => $q->where('pelunasan', 'lunas'));
            } else {
                $query->whereDoesntHave('pembayaran');
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

        if (!$project) {
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

        if (!$project) {
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
        $directory = 'project-description';

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

        if (!$project) {
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

        if (!$project) {
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
