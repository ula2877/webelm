<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Feature test untuk endpoint Dashboard statistik projek & pendapatan:
 *
 *   GET /api/dashboard?month=&year=&range=
 *
 * Sumber data (tabel existing, tanpa perubahan schema):
 *   - tb_project    : tanggal_mulai, status, harga
 *   - tb_pembayaran : id_project, nominal, pelunasan
 *
 * Catatan: tb_pembayaran tidak punya kolom tanggal, sehingga pembayaran
 * dikaitkan ke bulan `tanggal_mulai` projeknya. Test memakai periode jauh
 * (tahun 2049) yang pasti kosong di database nyata, jadi agregat 100% berasal
 * dari baris yang dibuat test ini. Setiap baris dihapus di tearDown walau
 * assertion gagal (pola sama dengan ProjectPelunasanFilterTest).
 */
class DashboardApiTest extends TestCase
{
    protected $connectionsToTransact = [];

    /** @var int[] */
    private array $createdProjectIds = [];
    /** @var int[] */
    private array $createdPaymentIds = [];
    private int $clientId;

    private const YEAR = 2049;

    protected function setUp(): void
    {
        parent::setUp();

        $user = DB::table('tb_user')->first();
        $this->assertNotNull($user, 'Need at least one user/client.');
        $this->clientId = (int) $user->id_user;

        $this->actingAs(\App\Models\User::find($user->id_user));
    }

    protected function tearDown(): void
    {
        if (!empty($this->createdPaymentIds)) {
            DB::table('tb_pembayaran')->whereIn('id_pembayaran', $this->createdPaymentIds)->delete();
        }

        if (!empty($this->createdProjectIds)) {
            DB::table('tb_project')->whereIn('id_project', $this->createdProjectIds)->delete();
        }

        parent::tearDown();
    }

    private function marker(): string
    {
        return 'DSH' . bin2hex(random_bytes(6));
    }

    /** Insert satu tb_project; tanggal_mulai dibentuk dari year + month + day. */
    private function createProject(
        string $status,
        int $harga,
        int $month,
        int $day = 5,
        string $urgency = 'normal',
        ?int $year = null
    ): int {
        $uuid = 'DS' . substr(bin2hex(random_bytes(12)), 0, 24);
        $year = $year ?? self::YEAR;

        $id = (int) DB::table('tb_project')->insertGetId([
            'uuid_project' => $uuid,
            'id_client' => $this->clientId,
            'judul' => $this->marker() . ' ' . $uuid,
            'jenis' => 'project',
            'deskripsi' => 'dashboard test',
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

    private function addPayment(int $projectId, string $pelunasan, int $nominal): int
    {
        $id = (int) DB::table('tb_pembayaran')->insertGetId([
            'id_project' => $projectId,
            'nominal' => $nominal,
            'bukti_tf' => '',
            'pelunasan' => $pelunasan,
        ]);
        $this->createdPaymentIds[] = $id;

        return $id;
    }

    private function dashboard(int $month, array $extra = []): \Illuminate\Testing\TestResponse
    {
        $query = http_build_query(array_merge(['month' => $month, 'year' => self::YEAR], $extra));

        return $this->getJson('/api/dashboard?' . $query);
    }

    public function test_defaults_to_current_month_and_year()
    {
        $res = $this->getJson('/api/dashboard');
        $res->assertStatus(200);

        $now = now();
        $this->assertSame('ok', $res->json('status'));
        $this->assertSame($now->month, (int) $res->json('data.period.month'));
        $this->assertSame($now->year, (int) $res->json('data.period.year'));
        $this->assertIsArray($res->json('data.series'));
        // Transparansi: tanggal transaksi pembayaran tidak tersedia.
        $this->assertFalse($res->json('data.income.payment_date_available'));

        echo "\n[TEST] dashboard default = bulan berjalan OK\n";
    }

    public function test_project_counts_by_status_in_selected_period()
    {
        $month = 1;
        $this->createProject('done', 1000000, $month);
        $this->createProject('running', 2000000, $month);
        $this->createProject('running', 3000000, $month);
        $this->createProject('cancel', 5000000, $month);
        // Projek di bulan lain tidak boleh ikut terhitung.
        $this->createProject('done', 999, $month + 1);

        $res = $this->dashboard($month);
        $res->assertStatus(200);

        $this->assertSame(1, (int) $res->json('data.projects.done'));
        $this->assertSame(2, (int) $res->json('data.projects.running'));
        $this->assertSame(1, (int) $res->json('data.projects.cancel'));
        // Total "dikerjakan" = done + running (cancel TIDAK dihitung).
        $this->assertSame(3, (int) $res->json('data.projects.total'));

        echo "\n[TEST] hitung Done/Running/Cancel + exclude cancel OK\n";
    }

    public function test_income_sums_payments_once_and_running_value_once()
    {
        $month = 2;

        // Satu projek running dengan TIGA transaksi pembayaran.
        $running = $this->createProject('running', 10000000, $month, 3);
        $this->addPayment($running, 'dp', 2000000);
        $this->addPayment($running, 'lunas', 3000000);
        $this->addPayment($running, 'lunas', 500000);

        // Projek done dengan satu pembayaran: nominalnya tetap dihitung,
        // tetapi harga kontraknya TIDAK masuk "nilai projek running".
        $done = $this->createProject('done', 7000000, $month, 15);
        $this->addPayment($done, 'lunas', 1000000);

        $res = $this->dashboard($month);
        $res->assertStatus(200);

        // 2.000.000 + 3.000.000 + 500.000 + 1.000.000 = 6.500.000 (tidak ganda).
        $this->assertSame(6500000, (int) $res->json('data.income.total_pembayaran'));
        // Hanya harga projek running, dibaca sekali = 10.000.000
        // (3 transaksi tidak mengalikan harga kontrak).
        $this->assertSame(10000000, (int) $res->json('data.income.total_nilai_running'));

        echo "\n[TEST] pembayaran & nilai running tidak berulang OK\n";
    }

    public function test_pelunasan_summary_follows_projects_page_logic()
    {
        $month = 3;

        // dp + lunas -> Lunas.
        $a = $this->createProject('running', 1000000, $month, 1);
        $this->addPayment($a, 'dp', 100000);
        $this->addPayment($a, 'lunas', 900000);

        // lunas saja -> Lunas.
        $b = $this->createProject('done', 1000000, $month, 2);
        $this->addPayment($b, 'lunas', 1000000);

        // dp saja -> Belum Lunas.
        $c = $this->createProject('running', 1000000, $month, 3);
        $this->addPayment($c, 'dp', 100000);

        // tanpa transaksi -> Belum Lunas.
        $this->createProject('cancel', 1000000, $month, 4);

        $res = $this->dashboard($month);
        $res->assertStatus(200);

        $this->assertSame(2, (int) $res->json('data.pelunasan.lunas'));
        $this->assertSame(2, (int) $res->json('data.pelunasan.belum_lunas'));
        $this->assertSame(4, (int) $res->json('data.pelunasan.total'));

        echo "\n[TEST] ringkasan pelunasan (Lunas/Belum Lunas) OK\n";
    }

    public function test_monthly_series_ends_at_selected_month_and_range_is_respected()
    {
        $month = 6;

        // Mei: projek running + pembayaran 500.
        $may = $this->createProject('running', 1000, 5, 10);
        $this->addPayment($may, 'dp', 500);

        // Juni (bulan terpilih): projek running harga 2000 + pembayaran 700.
        $june = $this->createProject('running', 2000, $month, 10);
        $this->addPayment($june, 'lunas', 700);

        $series = $this->dashboard($month)->assertStatus(200)->json('data.series');
        $this->assertCount(6, $series);
        $this->assertSame('2049-01', $series[0]['key']);
        $this->assertSame('2049-06', $series[5]['key']);
        // Mei (index 4).
        $this->assertSame(1, $series[4]['running']);
        $this->assertSame(500, $series[4]['pembayaran']);
        // Juni (index 5) = bulan terpilih.
        $this->assertSame(1, $series[5]['running']);
        $this->assertSame(2000, $series[5]['nilai_running']);
        $this->assertSame(700, $series[5]['pembayaran']);
        // Bulan tanpa data = 0 (empty state aman).
        $this->assertSame(0, $series[0]['running']);
        $this->assertSame(0, $series[0]['pembayaran']);

        // range bisa diperkecil.
        $short = $this->dashboard($month, ['range' => 3])->assertStatus(200)->json('data.series');
        $this->assertCount(3, $short);
        $this->assertSame('2049-04', $short[0]['key']);
        $this->assertSame('2049-06', $short[2]['key']);

        echo "\n[TEST] series bulanan + range OK\n";
    }

    public function test_new_project_without_payment_is_belum_lunas_and_zero_income()
    {
        $month = 7;
        // Projek belum lunas tanpa pembayaran sama sekali -> income 0.
        $this->createProject('running', 4000000, $month);

        $res = $this->dashboard($month);
        $res->assertStatus(200);

        $this->assertSame(1, (int) $res->json('data.projects.running'));
        $this->assertSame(0, (int) $res->json('data.income.total_pembayaran'));
        $this->assertSame(4000000, (int) $res->json('data.income.total_nilai_running'));
        $this->assertSame(0, (int) $res->json('data.pelunasan.lunas'));
        $this->assertSame(1, (int) $res->json('data.pelunasan.belum_lunas'));

        echo "\n[TEST] projek tanpa pembayaran = belum lunas, income 0 OK\n";
    }

    /** Baseline rekap bulan tertentu (dari data nyata) untuk perbandingan delta. */
    private function recapBaseline(string $key): array
    {
        return [
            'projects' => (int) DB::table('tb_project')
                ->whereRaw("DATE_FORMAT(tanggal_mulai, '%Y-%m') = ?", [$key])
                ->count(),
            'income' => (int) DB::table('tb_pembayaran as b')
                ->join('tb_project as p', 'p.id_project', '=', 'b.id_project')
                ->whereRaw("DATE_FORMAT(p.tanggal_mulai, '%Y-%m') = ?", [$key])
                ->sum('b.nominal'),
        ];
    }

    private function recapRowFor(string $key): ?array
    {
        $rows = $this->getJson('/api/dashboard')->assertStatus(200)->json('data.monthly_recap');
        foreach ($rows as $row) {
            if ($row['key'] === $key) {
                return $row;
            }
        }

        return null;
    }

    public function test_monthly_recap_has_twelve_months_and_newest_first()
    {
        $recap = $this->getJson('/api/dashboard')->assertStatus(200)->json('data.monthly_recap');

        $this->assertIsArray($recap);
        $this->assertCount(12, $recap);

        $now = now();
        $this->assertSame($now->format('Y-m'), $recap[0]['key']);
        $this->assertSame($now->copy()->subMonthsNoOverflow(11)->format('Y-m'), $recap[11]['key']);

        // Urut terbaru -> terlama.
        $keys = array_column($recap, 'key');
        $descending = $keys;
        rsort($descending);
        $this->assertSame($descending, $keys);

        // Label contoh "Oktober 2026".
        $this->assertMatchesRegularExpression('/^[A-Z][a-z]+ \d{4}$/', $recap[0]['label']);

        echo "\n[TEST] rekap 12 bulan, urut terbaru -> terlama OK\n";
    }

    public function test_monthly_recap_counts_projects_once_and_sums_income_once()
    {
        $now = now();
        $year = (int) $now->year;
        $month = (int) $now->month;
        $key = $now->format('Y-m');

        $baseline = $this->recapBaseline($key);

        // 3 projek; p1 punya 3 transaksi pembayaran, p2 punya 1, p3 tanpa.
        $p1 = $this->createProject('running', 5000000, $month, 3, 'normal', $year);
        $this->addPayment($p1, 'dp', 1000000);
        $this->addPayment($p1, 'lunas', 2000000);
        $this->addPayment($p1, 'lunas', 500000);

        $p2 = $this->createProject('done', 4000000, $month, 4, 'normal', $year);
        $this->addPayment($p2, 'lunas', 3000000);

        $p3 = $this->createProject('cancel', 1000000, $month, 5, 'normal', $year);

        $row = $this->recapRowFor($key);
        $this->assertNotNull($row);

        // 3 projek dihitung sekali (multi-transaksi p1 tidak menggandakan).
        $this->assertSame($baseline['projects'] + 3, $row['project_count']);
        // Income 1.000.000 + 2.000.000 + 500.000 + 3.000.000 = 6.500.000 sekali.
        $this->assertSame($baseline['income'] + 6500000, $row['income']);

        echo "\n[TEST] rekap: jumlah projek & income tidak duplikat OK\n";
    }

    public function test_monthly_recap_project_without_payment_adds_zero_income()
    {
        $now = now();
        $year = (int) $now->year;
        $month = (int) $now->month;
        $key = $now->format('Y-m');

        $baseline = $this->recapBaseline($key);

        $this->createProject('running', 2000000, $month, 6, 'normal', $year);

        $row = $this->recapRowFor($key);
        $this->assertNotNull($row);
        $this->assertSame($baseline['projects'] + 1, $row['project_count']);
        // Tanpa transaksi -> income tidak bertambah (0 delta).
        $this->assertSame($baseline['income'], $row['income']);

        echo "\n[TEST] rekap: projek tanpa pembayaran -> income 0 OK\n";
    }

    public function test_monthly_recap_is_independent_of_selected_period()
    {
        $withPastPeriod = $this->getJson('/api/dashboard?month=1&year=' . self::YEAR)
            ->assertStatus(200)->json('data.monthly_recap');
        $withCurrentPeriod = $this->getJson('/api/dashboard')
            ->assertStatus(200)->json('data.monthly_recap');

        // Rekap 12 bulan terakhir tetap sama walau selector periode berbeda.
        $this->assertSame(array_column($withPastPeriod, 'key'), array_column($withCurrentPeriod, 'key'));
        $this->assertCount(12, $withPastPeriod);

        // Bulan yang dipilih (Januari 2049) di luar jendela rekap -> tidak diubah.
        $this->assertNull(collect($withPastPeriod)->firstWhere('key', '2049-01'));

        echo "\n[TEST] rekap independen dari periode terpilih OK\n";
    }

    public function test_invalid_month_year_and_range_are_rejected()
    {
        $this->getJson('/api/dashboard?month=13')->assertStatus(422)->assertJsonValidationErrors('month');
        $this->getJson('/api/dashboard?month=0')->assertStatus(422)->assertJsonValidationErrors('month');
        $this->getJson('/api/dashboard?year=1999')->assertStatus(422)->assertJsonValidationErrors('year');
        $this->getJson('/api/dashboard?year=2101')->assertStatus(422)->assertJsonValidationErrors('year');
        $this->getJson('/api/dashboard?range=2')->assertStatus(422)->assertJsonValidationErrors('range');
        $this->getJson('/api/dashboard?range=13')->assertStatus(422)->assertJsonValidationErrors('range');

        echo "\n[TEST] validasi bulan/tahun/range (422) OK\n";
    }

    public function test_requires_authentication()
    {
        Auth::logout();

        $this->getJson('/api/dashboard')->assertStatus(401);

        echo "\n[TEST] dashboard butuh autentikasi (401) OK\n";
    }
}
