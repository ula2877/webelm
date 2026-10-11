<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Dashboard khusus worker: GET /api/dashboard saat user yang login ber-level
 * worker (tb_level id 2 = worker, 10 = worker pcb).
 *
 * Pembatasan data dilakukan SERVER-SIDE lewat tb_tim (tb_tim.id_worker ->
 * tb_project.id_project). Test membuat worker fiktif (username acak) supaya
 * tidak menyentuh data nyata; tiap baris dihapus di tearDown walau assertion
 * gagal (pola sama dengan DashboardApiTest).
 */
class WorkerDashboardApiTest extends TestCase
{
    protected $connectionsToTransact = [];

    private const YEAR = 2048;

    /** @var int[] */
    private array $createdProjectIds = [];
    /** @var int[] */
    private array $createdUserIds = [];
    private int $clientId;
    private int $workerAId;
    private int $workerBId;

    protected function setUp(): void
    {
        parent::setUp();

        $client = DB::table('tb_user')->orderBy('id_user')->first();
        $this->assertNotNull($client, 'Butuh minimal satu user di tb_user.');
        $this->clientId = (int) $client->id_user;

        $this->workerAId = $this->createUser(2, 'Worker A');
        $this->workerBId = $this->createUser(2, 'Worker B');
    }

    protected function tearDown(): void
    {
        if (!empty($this->createdProjectIds)) {
            // Hapus dependensi dulu walau schema punya ON DELETE CASCADE.
            DB::table('tb_tim')->whereIn('id_project', $this->createdProjectIds)->delete();
            DB::table('tb_pembayaran')->whereIn('id_project', $this->createdProjectIds)->delete();
            DB::table('tb_project')->whereIn('id_project', $this->createdProjectIds)->delete();
        }

        if (!empty($this->createdUserIds)) {
            DB::table('tb_user')->whereIn('id_user', $this->createdUserIds)->delete();
        }

        parent::tearDown();
    }

    private function createUser(int $idLevel, string $label): int
    {
        $suffix = substr(bin2hex(random_bytes(8)), 0, 10);
        $id = (int) DB::table('tb_user')->insertGetId([
            'username' => 'wtest_' . $suffix,
            'password' => bcrypt('secret'),
            'id_level' => $idLevel,
            'nama' => $label . ' ' . $suffix,
            'foto' => '',
            'alamat' => '',
            'no_hp' => '',
            'id_telegram' => '',
            'id_karyawan' => 'WK-' . $suffix,
        ]);
        $this->createdUserIds[] = $id;

        return $id;
    }

    private function createProject(
        string $status,
        int $harga,
        int $month,
        int $day = 5,
        string $urgency = 'normal',
        int $year = self::YEAR
    ): int {
        $uuid = 'WS' . substr(bin2hex(random_bytes(12)), 0, 24);

        $id = (int) DB::table('tb_project')->insertGetId([
            'uuid_project' => $uuid,
            'id_client' => $this->clientId,
            'judul' => 'WorkerDashboardTest ' . $uuid,
            'jenis' => 'project',
            'deskripsi' => 'worker dashboard test',
            'tanggal_mulai' => sprintf('%04d-%02d-%02d', $year, $month, $day),
            'tanggal_estimasi' => sprintf('%04d-%02d-%02d', $year, $month, min(28, $day + 1)),
            'tanggal_selesai' => sprintf('%04d-%02d-%02d', $year, $month, min(28, $day + 2)),
            'status' => $status,
            'urgency' => $urgency,
            'harga' => $harga,
            'is_proposed' => 0,
        ]);

        $this->createdProjectIds[] = $id;

        return $id;
    }

    /** Tambah relasi tb_tim tanpa menjaga keunikan (untuk uji distinct). */
    private function assign(int $projectId, int $workerId): void
    {
        DB::table('tb_tim')->insert([
            'id_project' => $projectId,
            'id_worker' => $workerId,
        ]);
    }

    private function dashboardAs(int $userId): \Illuminate\Testing\TestResponse
    {
        $this->actingAs(\App\Models\User::find($userId));

        return $this->getJson('/api/dashboard');
    }

    public function test_worker_sees_only_assigned_projects_counted_once()
    {
        // P1 running milik A; P2 done milik A dengan relasi tb_tim GANDA;
        // P3 cancel milik A; P4 done milik B -> tidak boleh terlihat oleh A.
        $p1 = $this->createProject('running', 1000000, 5);
        $p2 = $this->createProject('done', 2000000, 5);
        $p3 = $this->createProject('cancel', 3000000, 5);
        $p4 = $this->createProject('done', 4000000, 5);

        $this->assign($p1, $this->workerAId);
        $this->assign($p2, $this->workerAId);
        $this->assign($p2, $this->workerAId); // duplikat relasi
        $this->assign($p3, $this->workerAId);
        $this->assign($p4, $this->workerBId);

        $res = $this->dashboardAs($this->workerAId);
        $res->assertStatus(200);

        $this->assertSame('worker', $res->json('data.scope'));
        $this->assertSame(1, (int) $res->json('data.projects.running'));
        // P2 dihitung 1x walau relasi ganda; P4 milik B tidak ikut.
        $this->assertSame(1, (int) $res->json('data.projects.done'));
        $this->assertSame(1, (int) $res->json('data.projects.cancel'));
        $this->assertSame(3, (int) $res->json('data.projects.total'));
        $this->assertSame($this->workerAId, (int) $res->json('data.worker.id'));

        // Tidak ada agregat admin/global yang bocor ke worker.
        $data = $res->json('data');
        $this->assertArrayNotHasKey('income', $data);
        $this->assertArrayNotHasKey('pelunasan', $data);
        $this->assertArrayNotHasKey('monthly_recap', $data);
        $this->assertArrayNotHasKey('period', $data);

        // Role tidak bisa dimanipulasi lewat query string.
        $scoped = $this->getJson('/api/dashboard?month=1&year=' . self::YEAR);
        $scoped->assertStatus(200);
        $this->assertSame('worker', $scoped->json('data.scope'));
        // Param bulan/tahun tidak menyaring data worker (kartu bersifat all-time).
        $this->assertSame(3, (int) $scoped->json('data.projects.total'));

        echo "\n[TEST] worker: hanya projeknya, dihitung sekali, tidak bocor OK\n";
    }

    public function test_worker_series_six_months_including_current_and_zero_filled()
    {
        $now = now();
        $currentKey = $now->format('Y-m');
        $prev = $now->copy()->subMonthNoOverflow()->startOfMonth();

        $cur = $this->createProject('running', 1000, (int) $now->month, 8, 'normal', (int) $now->year);
        $prevProject = $this->createProject('done', 2000, (int) $prev->month, 8, 'normal', (int) $prev->year);
        $other = $this->createProject('running', 3000, (int) $now->month, 9, 'normal', (int) $now->year);

        $this->assign($cur, $this->workerAId);
        $this->assign($prevProject, $this->workerAId);
        $this->assign($other, $this->workerBId);

        $series = $this->dashboardAs($this->workerAId)->assertStatus(200)->json('data.series');
        $this->assertCount(6, $series);

        $keys = array_column($series, 'key');
        // Termasuk bulan berjalan di ujung TERBARU.
        $this->assertSame($currentKey, $keys[5]);
        // Titik terlama = 5 bulan lalu.
        $this->assertSame($now->copy()->subMonthsNoOverflow(5)->format('Y-m'), $keys[0]);
        // Urut kronologis terlama -> terbaru.
        $sorted = $keys;
        sort($sorted);
        $this->assertSame($sorted, $keys);

        // Bulan berjalan: running 1 (projek worker lain tidak bocor).
        $this->assertSame(1, $series[5]['running']);
        $this->assertSame(0, $series[5]['done']);
        // Bulan sebelumnya: done 1.
        $prevIndex = array_search($prev->format('Y-m'), $keys, true);
        $this->assertSame(1, $series[$prevIndex]['done']);
        // Ada bulan tanpa projek yang bernilai 0 (index 0 != prev).
        $this->assertContains(0, array_column($series, 'running'));
        $this->assertContains(0, array_column($series, 'done'));

        echo "\n[TEST] worker: series 6 bulan, kronologis, nol & tanpa bocor OK\n";
    }

    public function test_worker_without_projects_returns_zero_and_empty_series()
    {
        $res = $this->dashboardAs($this->workerAId);
        $res->assertStatus(200);

        $this->assertSame('worker', $res->json('data.scope'));
        $this->assertSame(0, (int) $res->json('data.projects.total'));
        $this->assertSame(0, (int) $res->json('data.projects.running'));
        $this->assertSame(0, (int) $res->json('data.projects.done'));

        $series = $res->json('data.series');
        $this->assertCount(6, $series);
        foreach ($series as $point) {
            $this->assertSame(0, (int) $point['running']);
            $this->assertSame(0, (int) $point['done']);
        }

        echo "\n[TEST] worker belum punya projek -> 0 + series nol OK\n";
    }

    public function test_admin_dashboard_remains_full_and_is_not_scoped()
    {
        $adminId = (int) DB::table('tb_user')
            ->where('id_level', 1)
            ->orderBy('id_user')
            ->value('id_user');
        $this->assertGreaterThan(0, $adminId);

        // Projek yang ditugaskan ke worker tetap milik seluruh sistem (admin).
        $p = $this->createProject('running', 500000, 4);
        $this->assign($p, $this->workerAId);

        $this->actingAs(\App\Models\User::find($adminId));
        $res = $this->getJson('/api/dashboard?month=4&year=' . self::YEAR);
        $res->assertStatus(200);

        $data = $res->json('data');
        $this->assertSame('admin', $data['scope']);
        // Bentuk lama tetap lengkap.
        $this->assertArrayHasKey('income', $data);
        $this->assertArrayHasKey('pelunasan', $data);
        $this->assertArrayHasKey('monthly_recap', $data);
        $this->assertArrayHasKey('series', $data);
        $this->assertArrayHasKey('available_years', $data);
        // Admin tetap melihat projek yang ditugaskan ke worker (tidak dibatasi).
        $this->assertSame(1, (int) $data['projects']['running']);

        echo "\n[TEST] admin: dashboard penuh, tidak ter-scope OK\n";
    }

    public function test_invalid_params_still_rejected_for_admin_and_worker()
    {
        $adminId = (int) DB::table('tb_user')
            ->where('id_level', 1)
            ->orderBy('id_user')
            ->value('id_user');
        $this->actingAs(\App\Models\User::find($adminId));

        $this->getJson('/api/dashboard?month=13')->assertStatus(422);
        $this->getJson('/api/dashboard?year=2101')->assertStatus(422);

        // Worker pun tetap kena validasi query yang salah.
        $res = $this->dashboardAs($this->workerAId);
        $res->assertStatus(200);
        $this->getJson('/api/dashboard?month=0')->assertStatus(422);

        echo "\n[TEST] validasi query tetap berlaku (admin & worker) OK\n";
    }
}