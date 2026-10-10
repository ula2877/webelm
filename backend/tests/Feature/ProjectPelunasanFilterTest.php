<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Functional test for the "Pelunasan" filter on the project list endpoint:
 *
 *   GET /api/projects?search=...&pelunasan=lunas|belum_lunas
 *
 * Categories are derived from tb_pembayaran (relation via id_project):
 *   lunas       = project has at least one 'lunas' transaction
 *   belum_lunas = project has NO 'lunas' transaction (no transaction / dp only)
 *
 * Follows the other feature tests: NO database refresh, the real MySQL
 * `webelmech` database is used and every row created here is removed in
 * tearDown even when an assertion fails.
 */
class ProjectPelunasanFilterTest extends TestCase
{
    protected $connectionsToTransact = [];

    /** @var int[] */
    private array $createdProjectIds = [];
    /** @var int[] */
    private array $createdPaymentIds = [];
    private int $clientId;

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

    /** Unique token embedded in judul so `search` isolates this test's rows. */
    private function marker(): string
    {
        return 'FLT' . bin2hex(random_bytes(6));
    }

    /** Create one tb_project row carrying the marker in its judul. */
    private function createProject(string $marker, string $status = 'running', string $urgency = 'normal'): int
    {
        $uuid = 'FT' . substr(bin2hex(random_bytes(12)), 0, 24); // <= 30

        $id = (int) DB::table('tb_project')->insertGetId([
            'uuid_project' => $uuid,
            'id_client' => $this->clientId,
            'judul' => $marker . ' ' . $uuid,
            'jenis' => 'project',
            'deskripsi' => 'pelunasan filter test',
            'tanggal_mulai' => '2026-01-01',
            'tanggal_estimasi' => '2026-02-01',
            'tanggal_selesai' => '2026-03-01',
            'status' => $status,
            'urgency' => $urgency,
            'harga' => 1000000,
            'is_proposed' => 0,
        ]);

        $this->createdProjectIds[] = $id;

        return $id;
    }

    private function addPayment(int $projectId, string $pelunasan, int $nominal = 100000): int
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

    /** @return array{ids: int[], occurrences: array<int,int>, total: int} */
    private function queryFilter(string $query): array
    {
        $res = $this->getJson('/api/projects?' . $query . '&per_page=100');
        $res->assertStatus(200);

        $ids = [];
        $occurrences = [];
        foreach ($res->json('data') as $row) {
            $id = (int) $row['id'];
            $ids[] = $id;
            $occurrences[$id] = ($occurrences[$id] ?? 0) + 1;
        }

        return [
            'ids' => $ids,
            'occurrences' => $occurrences,
            'total' => (int) $res->json('meta.total'),
        ];
    }

    public function test_filter_matches_the_four_payment_conditions()
    {
        $marker = $this->marker();

        $none = $this->createProject($marker);
        $onlyDp = $this->createProject($marker);
        $this->addPayment($onlyDp, 'dp');

        $dpAndLunas = $this->createProject($marker);
        $this->addPayment($dpAndLunas, 'dp');
        $this->addPayment($dpAndLunas, 'lunas', 900000);

        $onlyLunas = $this->createProject($marker);
        $this->addPayment($onlyLunas, 'lunas', 1000000);

        $lunas = $this->queryFilter('search=' . urlencode($marker) . '&pelunasan=lunas');
        $belum = $this->queryFilter('search=' . urlencode($marker) . '&pelunasan=belum_lunas');

        // Tidak ada transaksi -> Belum Lunas, bukan Lunas.
        $this->assertContains($none, $belum['ids']);
        $this->assertNotContains($none, $lunas['ids']);

        // Hanya DP -> Belum Lunas, bukan Lunas.
        $this->assertContains($onlyDp, $belum['ids']);
        $this->assertNotContains($onlyDp, $lunas['ids']);

        // DP dan Lunas -> Lunas, bukan Belum Lunas.
        $this->assertContains($dpAndLunas, $lunas['ids']);
        $this->assertNotContains($dpAndLunas, $belum['ids']);

        // Hanya Lunas -> Lunas, bukan Belum Lunas.
        $this->assertContains($onlyLunas, $lunas['ids']);
        $this->assertNotContains($onlyLunas, $belum['ids']);

        // Filter benar-benar menyaring: hanya projek yang tepat yang cocok.
        $this->assertCount(2, $lunas['ids']);
        $this->assertCount(2, $belum['ids']);

        echo "\n[TEST] pelunasan filter four conditions OK\n";
    }

    public function test_project_with_multiple_lunas_rows_appears_once()
    {
        $marker = $this->marker();

        $multi = $this->createProject($marker);
        $this->addPayment($multi, 'lunas', 400000);
        $this->addPayment($multi, 'lunas', 600000);
        $this->addPayment($multi, 'dp', 100000);

        $result = $this->queryFilter('search=' . urlencode($marker) . '&pelunasan=lunas');

        $this->assertSame(1, $result['total']);
        $this->assertSame([$multi], $result['ids']);
        $this->assertSame(1, $result['occurrences'][$multi] ?? 0);

        echo "\n[TEST] multiple lunas rows -> single row OK\n";
    }

    public function test_filter_combines_with_status_and_urgency_and_pagination()
    {
        $marker = $this->marker();

        // A: lunas, running, normal -> excluded by status=done/urgency=urgent.
        $a = $this->createProject($marker);
        $this->addPayment($a, 'lunas', 1000000);

        // B: lunas, done, urgent -> matches all combined filters.
        $b = $this->createProject($marker, 'done', 'urgent');
        $this->addPayment($b, 'lunas', 1000000);

        // C: dp only, done, urgent -> excluded by pelunasan=lunas.
        $c = $this->createProject($marker, 'done', 'urgent');
        $this->addPayment($c, 'dp');

        $combined = $this->queryFilter(
            'search=' . urlencode($marker) . '&pelunasan=lunas&status=done&urgency=urgent'
        );

        $this->assertSame(1, $combined['total']);
        $this->assertSame([$b], $combined['ids']);

        // Pagination/meta tetap akurat saat filter aktif.
        $paged = $this->getJson('/api/projects?search=' . urlencode($marker)
            . '&pelunasan=belum_lunas&per_page=1&page=1');
        $paged->assertStatus(200);
        $this->assertSame(1, (int) $paged->json('meta.total'));
        $this->assertSame(1, (int) $paged->json('meta.per_page'));
        $this->assertSame(1, count($paged->json('data')));
        $this->assertSame($c, (int) $paged->json('data.0.id'));

        echo "\n[TEST] combined filters + pagination OK\n";
    }

    public function test_empty_and_all_mean_no_pelunasan_filter()
    {
        $marker = $this->marker();
        $project = $this->createProject($marker);
        $this->addPayment($project, 'dp');

        $empty = $this->queryFilter('search=' . urlencode($marker) . '&pelunasan=');
        $all = $this->queryFilter('search=' . urlencode($marker) . '&pelunasan=all');

        $this->assertSame([$project], $empty['ids']);
        $this->assertSame([$project], $all['ids']);

        echo "\n[TEST] empty/all pelunasan = no filter OK\n";
    }

    public function test_invalid_pelunasan_value_is_rejected()
    {
        $this->getJson('/api/projects?pelunasan=belum_bayar')
            ->assertStatus(422)
            ->assertJsonValidationErrors('pelunasan');

        $this->getJson('/api/projects?pelunasan=cicil')
            ->assertStatus(422)
            ->assertJsonValidationErrors('pelunasan');

        echo "\n[TEST] invalid pelunasan rejected (422) OK\n";
    }
}
