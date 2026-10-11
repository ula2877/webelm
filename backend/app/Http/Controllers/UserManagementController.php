<?php

namespace App\Http\Controllers;

use App\Models\Level;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * User Management endpoints.
 *
 * Operates strictly on the EXISTING `tb_user` table. There is deliberately no
 * migration, no new table and no new column anywhere in this file - the real
 * schema was inspected and is the only schema used:
 *
 *   id_user          int(11)        PK, auto_increment
 *   username         varchar(50)    NOT NULL, UNIQUE
 *   password         varchar(500)   NOT NULL, bcrypt ($2y$)
 *   id_level         int(11)        NOT NULL, FK -> tb_level.id_level
 *                                    (ON DELETE CASCADE, ON UPDATE CASCADE)
 *   nama             varchar(500)   NOT NULL
 *   foto             varchar(250)   NOT NULL  (path/URL, may be '')
 *   tanggal_gabung   date           NULL DEFAULT current_timestamp()
 *   alamat           text           NOT NULL
 *   no_hp            varchar(30)    NOT NULL
 *   id_telegram      varchar(30)    NOT NULL
 *   id_karyawan      varchar(100)   NOT NULL
 *   remember_token   varchar(100)   NULL
 *   created_at       timestamp      NULL   (NULL for 101 of 102 existing rows)
 *   updated_at       timestamp      NULL
 *
 * Security notes:
 *  - Every response is built by hand in present(). `password`, `remember_token`
 *    and any other credential are never serialised, so they cannot leak even if
 *    someone later adds `password` to $hidden.
 *  - update() copies field by field from a fixed whitelist. The client can never
 *    set id_user, foto, tanggal_gabung, id_telegram, id_karyawan, created_at or
 *    updated_at, and an unknown key in the request body is simply ignored.
 */
class UserManagementController extends Controller
{
    /** Matches the existing frontend ITEMS_PER_PAGE. */
    private const DEFAULT_PER_PAGE = 8;

    /** tb_level.id_level untuk worker (2) dan worker pcb (10). */
    private const WORKER_LEVEL_IDS = [2, 10];

    /**
     * GET /api/users
     * ?search=&level=&page=&per_page=
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        $perPage = max(1, min(100, $perPage));

        $query = User::query()->with('level');

        // Search hits username AND nama, which is exactly the data the USER
        // column renders, so the result always matches what the user can see.
        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $like = '%' . $this->escapeLike($search) . '%';
            $query->where(function ($inner) use ($like) {
                $inner->where('username', 'like', $like)
                    ->orWhere('nama', 'like', $like);
            });
        }

        $level = $request->query('level');
        if ($level !== null && $level !== '' && $level !== 'all') {
            if (!is_numeric($level)) {
                throw ValidationException::withMessages([
                    'level' => ['Filter level tidak valid.'],
                ]);
            }

            $query->where('id_level', (int) $level);
        }

        // Stable order so pagination never repeats or skips a row.
        $users = $query->orderBy('id_user')->paginate($perPage);

        return response()->json([
            'status' => 'ok',
            'data' => array_map(fn (User $user) => $this->present($user), $users->items()),
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
                'from' => $users->firstItem(),
                'to' => $users->lastItem(),
            ],
            // Role options come from tb_level, never from a hardcoded list.
            'roles' => $this->roleOptions(),
        ], 200);
    }

    /**
     * GET /api/user-options
     * ?search=&level=&page=&per_page=
     *
     * Daftar user RINGKAS untuk mengisi dropdown pada form yang bukan halaman
     * User Management - khususnya pemilihan Client & Worker di form Projek,
     * yang juga dipakai level worker.
     *
     * Sengaja hanya mengembalikan kolom aman (id, username, nama, id_level,
     * role). Field sensitif seperti no_hp/alamat/tanggal hanya tersedia di
     * GET /api/users yang dibatasi middleware 'admin'. Endpoint ini hanya
     * butuh login (tidak admin) karena form Projek memang perlu daftar client
     * dan worker.
     */
    public function options(Request $request): JsonResponse
    {
        $perPage = (int) $request->query('per_page', 20);
        $perPage = max(1, min(100, $perPage));

        $query = User::query()->with('level');

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $like = '%' . $this->escapeLike($search) . '%';
            $query->where(function ($inner) use ($like) {
                $inner->where('username', 'like', $like)
                    ->orWhere('nama', 'like', $like);
            });
        }

        $level = $request->query('level');
        if ($level !== null && $level !== '' && $level !== 'all') {
            if (!is_numeric($level)) {
                throw ValidationException::withMessages([
                    'level' => ['Filter level tidak valid.'],
                ]);
            }

            $query->where('id_level', (int) $level);
        }

        $users = $query->orderBy('id_user')->paginate($perPage);

        return response()->json([
            'status' => 'ok',
            'data' => array_map(fn (User $user) => [
                'id' => (int) $user->id_user,
                'username' => $user->username,
                'nama' => $user->nama,
                'id_level' => (int) $user->id_level,
                'role' => $user->level ? $user->level->nama_level : null,
            ], $users->items()),
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
                'from' => $users->firstItem(),
                'to' => $users->lastItem(),
            ],
            'roles' => $this->roleOptions(),
        ], 200);
    }

    /**
     * GET /api/users/{id}/dependents
     *
     * Used by the delete confirmation dialog so a destructive action never
     * silently cascades away project / salary / letter records. The same
     * pre-flight check is repeated authoritatively inside destroy().
     */
    public function dependents(string $id): JsonResponse
    {
        $user = User::find($id);

        if (!$user) {
            return $this->notFound();
        }

        return response()->json([
            'status' => 'ok',
            ...$this->dependentRecords((int) $user->id_user),
        ], 200);
    }

    /**
     * GET /api/users/{id}
     *
     * Returns a single user by ID.
     */
    public function show(string $id): JsonResponse
    {
        $user = User::with('level')->find($id);

        if (!$user) {
            return $this->notFound();
        }

        return response()->json([
            'status' => 'ok',
            'data' => $this->present($user),
        ], 200);
    }

    /**
     * PUT /api/users/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $user = User::find($id);

        if (!$user) {
            return $this->notFound();
        }

        $this->normaliseOptionalPassword($request);

        $validated = $request->validate([
            'username' => [
                'required',
                'string',
                'min:3',
                'max:50',
                // Same character rule the profile page already enforces.
                'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('tb_user', 'username')->ignore($user->id_user, 'id_user'),
            ],
            'nama' => [
                'required',
                'string',
                'max:500',
            ],
            'id_level' => [
                'required',
                'integer',
                Rule::exists('tb_level', 'id_level'),
            ],
            'no_hp' => [
                'required',
                'string',
                'max:30',
            ],
            'alamat' => [
                'required',
                'string',
                'max:2000',
            ],
            // Optional. An absent / empty value keeps the stored hash untouched,
            // and the stored hash is never returned to the client either way.
            'password' => [
                'nullable',
                'string',
                'min:8',
                'max:255',
                'confirmed',
            ],
            // Optional so a client that does not know about the field (or an
            // edit of a non-worker level) can never trip a new required rule.
            // When present it is written to the EXISTING tb_user.id_karyawan
            // column - no column is added anywhere.
            'id_karyawan' => [
                'nullable',
                'string',
                'max:100',
            ],
        ], [
            'username.required' => 'Username wajib diisi.',
            'username.min' => 'Username minimal 3 karakter.',
            'username.max' => 'Username maksimal 50 karakter.',
            'username.regex' => 'Username hanya boleh berisi huruf, angka, titik, underscore, atau strip.',
            'username.unique' => 'Username sudah digunakan oleh user lain.',
            'nama.required' => 'Nama wajib diisi.',
            'nama.max' => 'Nama maksimal 500 karakter.',
            'id_level.required' => 'Level wajib dipilih.',
            'id_level.exists' => 'Level yang dipilih tidak tersedia.',
            'no_hp.required' => 'No. HP wajib diisi.',
            'no_hp.max' => 'No. HP maksimal 30 karakter.',
            'alamat.required' => 'Alamat wajib diisi.',
            'password.min' => 'Password baru minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi password tidak sama dengan password baru.',
            'id_karyawan.max' => 'ID Karyawan maksimal 100 karakter.',
        ]);

        // Field-by-field whitelist. Nothing outside this block is writable.
        $user->username = $validated['username'];
        $user->nama = $validated['nama'];
        $user->id_level = (int) $validated['id_level'];
        $user->no_hp = $validated['no_hp'];
        $user->alamat = $validated['alamat'];

        // Only overwrite id_karyawan when the client actually sent it, so an
        // edit that does not touch the field can never blank it out. The value
        // already passed the id_karyawan rule above.
        if ($request->has('id_karyawan')) {
            $user->id_karyawan = trim((string) $validated['id_karyawan']);
        }

        if (!empty($validated['password'])) {
            // Same hashing scheme already used for tb_user ($2y$ bcrypt).
            $user->password = Hash::make($validated['password']);
        }

        try {
            $user->save();
        } catch (QueryException $e) {
            return $this->writeFailed('Gagal menyimpan perubahan user.');
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'User berhasil diperbarui.',
            'data' => $this->present($user->fresh()->load('level')),
        ], 200);
    }

    /**
     * POST /api/users
     *
     * Add User already existed as a button in this page, so it writes to the
     * existing table using existing columns only. No schema is added.
     *
     * Conditional validation: id_karyawan is required when level is 'worker'
     * (id=2) or 'worker pcb' (id=10). For other levels it defaults to ''.
     */
    public function store(Request $request): JsonResponse
    {
        $this->normaliseOptionalPassword($request);

        // First validate basic fields to get id_level for conditional rules
        $validated = $request->validate([
            'username' => [
                'required',
                'string',
                'min:3',
                'max:50',
                'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('tb_user', 'username'),
            ],
            'nama' => ['required', 'string', 'max:500'],
            'id_level' => ['required', 'integer', Rule::exists('tb_level', 'id_level')],
            'no_hp' => ['required', 'string', 'max:30'],
            'alamat' => ['required', 'string', 'max:2000'],
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed'],
            // id_karyawan is validated conditionally below
            'id_karyawan' => ['nullable', 'string', 'max:100'],
        ], [
            'username.required' => 'Username wajib diisi.',
            'username.min' => 'Username minimal 3 karakter.',
            'username.max' => 'Username maksimal 50 karakter.',
            'username.regex' => 'Username hanya boleh berisi huruf, angka, titik, underscore, atau strip.',
            'username.unique' => 'Username sudah digunakan oleh user lain.',
            'nama.required' => 'Nama wajib diisi.',
            'id_level.required' => 'Level wajib dipilih.',
            'id_level.exists' => 'Level yang dipilih tidak tersedia.',
            'no_hp.required' => 'No. HP wajib diisi.',
            'alamat.required' => 'Alamat wajib diisi.',
            'password.required' => 'Password wajib diisi.',
            'password.min' => 'Password minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi password tidak sama dengan password baru.',
            'id_karyawan.max' => 'ID Karyawan maksimal 100 karakter.',
        ]);

        // Conditional validation: worker (2) and worker pcb (10) require id_karyawan
        $workerLevelIds = [2, 10]; // worker, worker pcb
        $selectedLevel = (int) $validated['id_level'];

        if (in_array($selectedLevel, $workerLevelIds, true)) {
            $request->validate([
                'id_karyawan' => ['required', 'string', 'max:100'],
            ], [
                'id_karyawan.required' => 'ID Karyawan wajib diisi untuk level Worker / Worker PCB.',
                'id_karyawan.max' => 'ID Karyawan maksimal 100 karakter.',
            ]);
        }

        $user = new User();

        // Whitelist fields. foto / id_telegram / id_karyawan are NOT NULL without
        // a default, so they are seeded with '' - the same value the existing
        // rows already use for users without a photo. tanggal_gabung keeps its
        // column default (current_timestamp).
        $user->username = $validated['username'];
        $user->nama = $validated['nama'];
        $user->id_level = (int) $validated['id_level'];
        $user->no_hp = $validated['no_hp'];
        $user->alamat = $validated['alamat'];
        $user->foto = '';
        $user->id_telegram = '';
        // id_karyawan: required for worker/worker pcb, else empty string
        $user->id_karyawan = in_array($selectedLevel, $workerLevelIds, true)
            ? $validated['id_karyawan']
            : '';
        $user->password = Hash::make($validated['password']);

        try {
            $user->save();
        } catch (QueryException $e) {
            return $this->writeFailed('Gagal membuat user baru.');
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'User berhasil ditambahkan.',
            'data' => $this->present($user->fresh()->load('level')),
        ], 201);
    }

    /**
     * DELETE /api/users/{id}
     */
    public function destroy(string $id): JsonResponse
    {
        $user = User::find($id);

        if (!$user) {
            return $this->notFound();
        }

        // 1. Never let the authenticated user delete their own account. This is
        //    checked before anything else so it can never lock the session out.
        if ((int) $user->id_user === (int) Auth::id()) {
            return response()->json([
                'status' => 'error',
                'code' => 'self_delete',
                'message' => 'User yang sedang login tidak dapat dihapus.',
            ], 403);
        }

        // 2. tb_user is referenced by 14 foreign keys. 9 of them are
        //    ON DELETE CASCADE, so a blind delete would silently remove project,
        //    PCB, salary, team and schedule rows. 5 of them (RESTRICT /
        //    NO ACTION) would make the DELETE fail. Both are checked here so the
        //    user gets a readable message instead of a MySQL error.
        $dependents = $this->dependentRecords((int) $user->id_user);

        if ($dependents['blocking'] !== []) {
            return response()->json([
                'status' => 'error',
                'code' => 'has_dependents',
                'message' => 'User tidak dapat dihapus karena masih memiliki data terkait: '
                    . implode(', ', array_map(
                        fn (array $row) => $row['count'] . ' data ' . $row['table'],
                        $dependents['blocking']
                    ))
                    . '. Hapus atau pindahkan data terkait terlebih dahulu.',
                'blocking' => $dependents['blocking'],
            ], 409);
        }

        // 3. tb_file_worker.id_user cascades at the database level, so its rows
        //    vanish together with the user, but the physical files under
        //    storage/app/public/worker/ would be left behind as orphans.
        //    Remember the paths BEFORE the delete (the rows are gone after it)
        //    and remove the physical files only AFTER the delete succeeded -
        //    if the delete failed, no file of a still-existing user is touched.
        $workerFilePaths = DB::table('tb_file_worker')
            ->where('id_user', $user->id_user)
            ->pluck('path')
            ->all();

        try {
            $user->delete();
        } catch (QueryException $e) {
            // Never surface a driver error or stack trace to the browser.
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menghapus user. User mungkin masih digunakan oleh data lain.',
            ], 409);
        }

        $workerFilesRemoved = $this->deleteWorkerPhysicalFiles($workerFilePaths);

        return response()->json([
            'status' => 'ok',
            'message' => 'User berhasil dihapus.',
            'deleted' => [
                'id' => (int) $user->id_user,
                'username' => $user->username,
                'cascaded' => $dependents['cascading'],
                'worker_files_removed' => $workerFilesRemoved,
            ],
        ], 200);
    }

    /**
     * Best-effort removal of the physical worker files owned by a user that was
     * just deleted. The list is ALWAYS pre-filtered by id_user by the caller,
     * and only paths resolving inside the managed "worker/" directory of the
     * public disk are removed - a legacy path or external URL is left untouched,
     * so a file belonging to another user can never be deleted from here.
     * A failed unlink only means a harmless orphan file, never data loss.
     */
    private function deleteWorkerPhysicalFiles(array $paths): int
    {
        $disk = Storage::disk('public');
        $removed = 0;

        foreach ($paths as $path) {
            $relative = $this->storageRelativePath((string) $path);

            if ($relative !== null && str_starts_with($relative, 'worker/') && $disk->delete($relative)) {
                $removed++;
            }
        }

        return $removed;
    }

    // ------------------------------------------------------------------ helpers

    /**
     * The only place a user row is turned into an API payload.
     *
     * Whitelisted explicitly. `password` and `remember_token` are absent by
     * construction, and so is the raw `foto` path (the resolved `foto_url` is
     * enough for the UI).
     */
    private function present(User $user): array
    {
        // created_at exists but is NULL for 101 of the 102 current rows, while
        // tanggal_gabung is populated for every row. Prefer the real creation
        // timestamp and fall back to the join date, so the CREATED column always
        // shows a real stored date and never a fabricated one.
        $created = $user->created_at ?: $user->tanggal_gabung;

        return [
            'id' => (int) $user->id_user,
            'username' => $user->username,
            'nama' => $user->nama,
            'id_level' => (int) $user->id_level,
            'role' => $user->level ? $user->level->nama_level : null,
            'foto_url' => $user->fotoUrl(),
            'no_hp' => $user->no_hp,
            'alamat' => $user->alamat,
            'id_karyawan' => (string) $user->id_karyawan,
            'created' => $this->dateOnly($created),
            'tanggal_gabung' => $this->dateOnly($user->tanggal_gabung),
            'is_self' => (int) $user->id_user === (int) Auth::id(),
        ];
    }

    /**
     * Real role list straight from tb_level, with a live user count so the
     * filter dropdown can never drift from the database.
     */
    private function roleOptions(): array
    {
        $rows = Level::query()
            ->leftJoin('tb_user', 'tb_user.id_level', '=', 'tb_level.id_level')
            ->select('tb_level.id_level', 'tb_level.nama_level', DB::raw('COUNT(tb_user.id_user) AS users_count'))
            ->groupBy('tb_level.id_level', 'tb_level.nama_level')
            ->orderBy('tb_level.nama_level')
            ->get();

        return $rows->map(fn ($row) => [
            'id_level' => (int) $row->id_level,
            'nama_level' => $row->nama_level,
            'users_count' => (int) $row->users_count,
        ])->all();
    }

    /**
     * Which tables currently point at this user, split by what the database
     * would do on delete.
     *
     * The child table/column names are read from information_schema and are
     * re-checked against a strict identifier pattern before being used in a
     * count query, so nothing from the request can reach the SQL string.
     *
     * blocking: RESTRICT / NO ACTION -> the DELETE would fail
     * cascading: CASCADE               -> the DELETE would wipe these rows
     */
    private function dependentRecords(int $userId): array
    {
        // NOTE: `REFERENCED_COLUMN_NAME` does NOT exist on
        // information_schema.REFERENTIAL_CONSTRAINTS (MySQL) - only on
        // KEY_COLUMN_USAGE - so the parent-column filter lives on the kcu alias.
        // The extra TABLE_NAME join keeps multi-table constraint names apart.
        $rows = DB::select(
            "SELECT rc.TABLE_NAME AS child_table,
                    rc.DELETE_RULE AS delete_rule,
                    kcu.COLUMN_NAME AS child_column
             FROM information_schema.REFERENTIAL_CONSTRAINTS rc
             JOIN information_schema.KEY_COLUMN_USAGE kcu
               ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
              AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
              AND kcu.TABLE_NAME = rc.TABLE_NAME
             WHERE rc.UNIQUE_CONSTRAINT_SCHEMA = DATABASE()
               AND rc.REFERENCED_TABLE_NAME = ?
               AND kcu.REFERENCED_COLUMN_NAME = ?",
            ['tb_user', 'id_user']
        );

        $blocking = [];
        $cascading = [];

        foreach ($rows as $row) {
            $table = (string) $row->child_table;
            $column = (string) $row->child_column;

            if (!preg_match('/^[A-Za-z0-9_]+$/', $table) || !preg_match('/^[A-Za-z0-9_]+$/', $column)) {
                continue;
            }

            $count = DB::table($table)->where($column, $userId)->count();

            if ($count === 0) {
                continue;
            }

            $entry = ['table' => $table, 'column' => $column, 'count' => $count];

            if (strtoupper((string) $row->delete_rule) === 'CASCADE') {
                $cascading[] = $entry;
            } else {
                $blocking[] = $entry;
            }
        }

        return [
            'blocking' => $blocking,
            'cascading' => $cascading,
            'cascading_total' => array_sum(array_column($cascading, 'count')),
        ];
    }

    /**
     * An empty password field means "leave the current password alone", so it is
     * normalised to null before validation instead of failing min:8.
     */
    private function normaliseOptionalPassword(Request $request): void
    {
        if ($request->has('password') && trim((string) $request->input('password')) === '') {
            $request->merge(['password' => null]);
        }
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
        if ($value === null || $value === '') {
            return null;
        }

        // Always YYYY-MM-DD. Sending a date-only string avoids the timezone
        // shift that would otherwise turn 2023-07-30 into Jul 29 in the
        // browser.
        return substr((string) $value, 0, 10);
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'status' => 'error',
            'message' => 'User tidak ditemukan.',
        ], 404);
    }

    private function writeFailed(string $message): JsonResponse
    {
        return response()->json([
            'status' => 'error',
            'message' => $message,
        ], 500);
    }

    // ============================================================
    // Worker File endpoints (uses existing tb_file_worker table)
    // ============================================================

    /**
     * GET /api/users/{id}/worker-files
     * List all worker files for a user.
     */
    public function workerFiles(string $id): JsonResponse
    {
        $user = User::find($id);

        if (!$user) {
            return $this->notFound();
        }

        $files = DB::table('tb_file_worker')
            ->where('id_user', $user->id_user)
            ->orderBy('tanggal_upload', 'desc')
            ->get()
            ->map(function ($file) {
                // `path` is exposed as a ready-to-use ABSOLUTE URL for both
                // shapes found in the column: values written by the new code
                // are already absolute (passed through unchanged) and legacy
                // relative paths ("/storage/worker/x.pdf") are resolved here.
                // The raw value is still what drives the physical delete.
                $url = $this->resolveFileUrl((string) $file->path);

                return [
                    'id' => (int) $file->id,
                    'id_user' => (int) $file->id_user,
                    'jenis' => $file->jenis,
                    'path' => $url,
                    'filename' => basename((string) $file->path),
                    'tanggal_upload' => $file->tanggal_upload,
                    'url' => $url,
                ];
            });

        return response()->json([
            'status' => 'ok',
            'data' => $files,
        ], 200);
    }

    /**
     * POST /api/users/{id}/worker-files
     * Upload a new worker file.
     */
    public function uploadWorkerFile(Request $request, string $id): JsonResponse
    {
        $user = User::find($id);

        if (!$user) {
            return $this->notFound();
        }

        // File worker hanya berlaku untuk level worker (2) / worker pcb (10).
        // Level lain tidak boleh menerima upload, dan file yang sudah ada tidak
        // pernah dihapus ketika level berubah.
        if (!in_array((int) $user->id_level, self::WORKER_LEVEL_IDS, true)) {
            return response()->json([
                'status' => 'error',
                'message' => 'File worker hanya tersedia untuk level worker / worker pcb.',
            ], 403);
        }

        $validated = $request->validate([
            'jenis' => ['required', 'string', 'in:KTP,NPWP,CV,Surat Perjanjian Kerja,Sertifikat Keahlian'],
            'file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png,webp'],
        ], [
            'jenis.required' => 'Silakan pilih jenis file.',
            'jenis.in' => 'Jenis file tidak valid.',
            'file.required' => 'Silakan pilih file.',
            'file.max' => 'Ukuran file maksimal 10 MB.',
            'file.mimes' => 'Format file harus PDF, JPG, JPEG, PNG, atau WEBP.',
        ]);

        $file = $request->file('file');
        $disk = Storage::disk('public');
        $directory = 'worker';

        // Extension comes from the MIME type detected on the server, never from
        // the client-supplied name, and is whitelisted - exactly the same rule
        // ProfileController::uploadPhoto() already applies. The frontend only
        // ever sends `file` + `jenis`; the storage path is built here.
        $extension = strtolower($file->guessExtension() ?: 'pdf');
        if (!in_array($extension, ['pdf', 'jpg', 'jpeg', 'png', 'webp'], true)) {
            $extension = 'pdf';
        }

        // Nama file = token unik milik server (tidak bisa tabrakan, tidak bisa
        // dipengaruhi frontend) + basenama asli yang sudah disaring whitelist
        // karakter sehingga tetap terbaca di daftar File Worker.
        $originalName = $this->safeOriginalName($file->getClientOriginalName());
        $filename = 'worker_' . $user->id_user . '_' . time() . '_' . Str::random(8)
            . ($originalName !== '' ? '_' . $originalName : '')
            . '.' . $extension;
        $relativePath = $directory . '/' . $filename;

        // Save file to storage
        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false || !$disk->put($relativePath, $stream)) {
            if (is_resource($stream)) fclose($stream);
            return $this->writeFailed('Gagal menyimpan file.');
        }
        if (is_resource($stream)) fclose($stream);

        try {
            // Insert record - tb_file_worker.id_user -> tb_user.id_user.
            // Only the VALUE stored in `path` changes: it now holds the
            // ABSOLUTE URL (public disk URL = APP_URL + "/storage/...") instead
            // of a relative path, so the API can return it ready-to-use.
            $fileUrl = $disk->url($relativePath);
            $fileId = DB::table('tb_file_worker')->insertGetId([
                'id_user' => $user->id_user,
                'jenis' => $validated['jenis'],
                'path' => $fileUrl,
                'tanggal_upload' => now(),
            ]);
        } catch (QueryException $e) {
            // Roll the physical file back so a failed insert never leaves an
            // orphan file in storage.
            $disk->delete($relativePath);
            return $this->writeFailed('Gagal menyimpan data file.');
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'File berhasil diunggah.',
            'data' => [
                'id' => $fileId,
                'id_user' => (int) $user->id_user,
                'jenis' => $validated['jenis'],
                'path' => $fileUrl,
                'filename' => $filename,
                'tanggal_upload' => now()->toDateTimeString(),
                'url' => $fileUrl,
            ],
        ], 201);
    }

    /**
     * DELETE /api/worker-files/{fileId}?id_user=
     * Delete a worker file.
     *
     * The caller may send the owning user id; when it is present it must match
     * the stored record, so a file can never be removed through the wrong user.
     * Only the physical file of THAT record plus its own row are touched - no
     * other file, no user row.
     */
    public function deleteWorkerFile(Request $request, string $fileId): JsonResponse
    {
        $file = DB::table('tb_file_worker')->where('id', $fileId)->first();

        if (!$file) {
            return response()->json([
                'status' => 'error',
                'message' => 'File tidak ditemukan.',
            ], 404);
        }

        $requestedUserId = $request->query('id_user', $request->input('id_user'));

        if ($requestedUserId !== null && $requestedUserId !== ''
            && (int) $requestedUserId !== (int) $file->id_user) {
            return response()->json([
                'status' => 'error',
                'message' => 'File tidak dimiliki oleh user tersebut.',
            ], 403);
        }

        // 1. Delete the physical file first (only files inside our own managed
        //    "worker" directory are ever removed - a legacy or absolute URL is
        //    left untouched), then 2. the database record.
        $disk = Storage::disk('public');
        $relative = $this->storageRelativePath((string) $file->path);

        if ($relative !== null && str_starts_with($relative, 'worker/')) {
            $disk->delete($relative);
        }

        DB::table('tb_file_worker')->where('id', $fileId)->delete();

        return response()->json([
            'status' => 'ok',
            'message' => 'File berhasil dihapus.',
        ], 200);
    }

    /**
     * Saring nama file asli dari klien menjadi basenama aman yang hanya dipakai
     * untuk keterbacaan di daftar File Worker:
     *  - dibuang direktorinya (hanya basenama)
     *  - whitelist karakter [A-Za-z0-9._-], sisanya diganti underscore
     *  - ekstensi dibuang (ekstensi selalu ditentukan server dari MIME)
     *  - tanpa leading dot, dipotong maksimal 60 karakter
     * Path penyimpanan tidak pernah memakai nilai mentah dari klien.
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
     * Map a stored path onto the public disk's relative path.
     *
     * Two shapes are understood (everything else returns null and is NEVER
     * touched by a delete):
     *   - absolute URL written by the new code:
     *       http://127.0.0.1:8000/storage/worker/x.pdf  -> worker/x.pdf
     *     accepted only when it sits directly on our own public disk base
     *     ("<APP_URL>/storage/"); an external URL such as
     *     https://backend.elmechtechnology.com/assesst/Worker/x.pdf is refused.
     *   - relative path written by the old code: /storage/worker/x.pdf
     *
     * A failed match can only ever leave a harmless orphan file behind - it can
     * never delete a file that is not ours.
     */
    private function storageRelativePath(string $path): ?string
    {
        $path = trim($path);

        if ($path === '') {
            return null;
        }

        $disk = Storage::disk('public');

        // Absolute URL -> strip OUR disk base ("<APP_URL>/storage/") only.
        if (preg_match('#^https?://#i', $path)) {
            $diskBase = rtrim($disk->url(''), '/');

            if ($diskBase === '' || stripos($path, $diskBase . '/') !== 0) {
                return null;
            }

            return rawurldecode(substr($path, strlen($diskBase) + 1));
        }

        if (!str_starts_with($path, '/storage/')) {
            return null;
        }

        $relative = ltrim($path, '/');
        $prefix = trim((string) parse_url($disk->url(''), PHP_URL_PATH), '/');

        if ($prefix !== '' && str_starts_with($relative, $prefix . '/')) {
            $relative = substr($relative, strlen($prefix) + 1);
        }

        return $relative;
    }

    /**
     * Resolve stored path to a full URL.
     *
     * Values that are already absolute (the shape the new code writes) are
     * returned untouched, so an external legacy URL keeps pointing at its
     * original host instead of being re-based onto APP_URL.
     */
    private function resolveFileUrl(string $path): string
    {
        if (preg_match('#^https?://#i', trim($path))) {
            return trim($path);
        }

        $relative = $this->storageRelativePath($path);

        if ($relative === null) {
            return $path;
        }

        return Storage::disk('public')->url($relative);
    }
}
