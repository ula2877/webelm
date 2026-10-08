<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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

    /**
     * GET /api/projects
     * ?search=&status=&jenis=&page=&per_page=
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
            'jenis' => ['required', 'string', Rule::in(self::VALID_JENIS)],
            // Kolom NOT NULL: null/absen disimpan sebagai '' (pola yang sama
            // dipakai UserManagementController untuk foto/id_telegram).
            'deskripsi' => ['nullable', 'string'],
            // Kolom tanggal NOT NULL tanpa default + koneksi strict (tidak
            // bisa tulis '0000-00-00'), jadi ketiganya wajib diisi saat tulis.
            'tanggal_mulai' => ['required', 'date'],
            'tanggal_estimasi' => ['required', 'date'],
            'tanggal_selesai' => ['required', 'date', 'after_or_equal:tanggal_mulai'],
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
            'jenis.required' => 'Jenis projek wajib dipilih.',
            'jenis.in' => 'Jenis projek tidak valid.',
            'tanggal_mulai.required' => 'Tanggal mulai wajib diisi.',
            'tanggal_estimasi.required' => 'Tanggal estimasi wajib diisi.',
            'tanggal_selesai.required' => 'Tanggal selesai wajib diisi.',
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
        $project->jenis = $validated['jenis'];
        $project->deskripsi = (string) ($validated['deskripsi'] ?? '');
        $project->tanggal_mulai = $validated['tanggal_mulai'];
        $project->tanggal_estimasi = $validated['tanggal_estimasi'];
        $project->tanggal_selesai = $validated['tanggal_selesai'];
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
                $workers[] = [
                    'id' => (int) $row->id_worker,
                    'nama' => $row->worker ? $row->worker->nama : null,
                ];
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

        return [
            'id' => (int) $project->id_project,
            'uuid' => $project->uuid_project,
            'code' => $project->uuid_project,
            'id_client' => (int) $project->id_client,
            'client' => $project->client ? $project->client->nama : null,
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
