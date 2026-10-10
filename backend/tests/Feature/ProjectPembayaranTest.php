<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Functional test for project payment management (tb_pembayaran) exposed through
 * the UUID-based endpoints:
 *
 *   GET  /api/projects/uuid/{uuid}/pembayaran
 *   POST /api/projects/uuid/{uuid}/pembayaran
 *
 * Follows ProjectProgressDeleteTest: NO database refresh, the real MySQL
 * `webelmech` database is used and every row/file created here is cleaned up
 * even when an assertion fails.
 */
class ProjectPembayaranTest extends TestCase
{
    protected $connectionsToTransact = [];

    private string $disk;
    private string $directory;

    /** @var int[] */
    private array $createdPaymentIds = [];
    /** @var string[] */
    private array $createdPaths = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->disk = config('elmech.project_file.disk', 'public');
        $this->directory = trim(config('elmech.project_file.directory', 'project-files'), '/');

        $user = DB::table('tb_user')->first();
        $this->assertNotNull($user, 'Need at least one user to authenticate.');
        $this->actingAs(\App\Models\User::find($user->id_user));
    }

    protected function tearDown(): void
    {
        foreach ($this->createdPaths as $path) {
            Storage::disk($this->disk)->delete($path);
        }

        if (!empty($this->createdPaymentIds)) {
            DB::table('tb_pembayaran')->whereIn('id_pembayaran', $this->createdPaymentIds)->delete();
        }

        parent::tearDown();
    }

    private function projectTotal(int $projectId): int
    {
        return (int) DB::table('tb_pembayaran')->where('id_project', $projectId)->sum('nominal');
    }

    /** First project that has no payment row at all. */
    private function projectWithoutPayments()
    {
        return DB::table('tb_project')->orderBy('id_project')->get()->first(function ($p) {
            return DB::table('tb_pembayaran')->where('id_project', $p->id_project)->count() === 0;
        });
    }

    /** First project whose remaining balance is > 0. */
    private function projectWithRemaining()
    {
        return DB::table('tb_project')->orderBy('id_project')->get()->first(function ($p) {
            return (int) $p->harga - $this->projectTotal((int) $p->id_project) > 0;
        });
    }

    /** First project with no payments and at least $min of remaining balance. */
    private function projectWithoutPaymentsWithRemaining(int $min)
    {
        return DB::table('tb_project')->orderBy('id_project')->get()->first(function ($p) use ($min) {
            if (DB::table('tb_pembayaran')->where('id_project', $p->id_project)->exists()) {
                return false;
            }

            return (int) $p->harga >= $min;
        });
    }

    /** First two distinct projects. */
    private function twoProjects(): array
    {
        $rows = DB::table('tb_project')->orderBy('id_project')->limit(2)->get()->all();

        return [$rows[0] ?? null, $rows[1] ?? null];
    }

    /** POST that always asks for a JSON response (supports multipart). */
    private function postForm(string $uri, array $data)
    {
        return $this->post($uri, $data, ['Accept' => 'application/json']);
    }

    /** Track the payment just created through the API so tearDown removes it. */
    private function trackFromResponse($response): int
    {
        $id = (int) $response->json('data.pembayaran.0.id');
        $this->createdPaymentIds[] = $id;

        return $id;
    }

    /** Track the physical bukti file behind an absolute URL. */
    private function trackProofUrl(string $url): ?string
    {
        $path = parse_url($url, PHP_URL_PATH);
        if (!$path) {
            return null;
        }
        $relative = $this->directory . '/' . basename($path);
        $this->createdPaths[] = $relative;

        return $relative;
    }

    public function test_get_summary_without_transactions()
    {
        $project = $this->projectWithoutPayments();
        if (!$project) {
            $this->markTestSkipped('Need a project without payments.');
        }

        $response = $this->getJson("/api/projects/uuid/{$project->uuid_project}/pembayaran");
        $response->assertStatus(200);
        $response->assertJsonPath('status', 'ok');
        $response->assertJsonPath('data.harga', (int) $project->harga);
        $response->assertJsonPath('data.total_pembayaran', 0);
        $response->assertJsonPath('data.sisa', (int) $project->harga);
        $response->assertJsonPath('data.kelebihan', 0);
        $response->assertJsonPath('data.pelunasan', 'belum_bayar');
        $response->assertJsonPath('data.has_transaction_date', false);
        $this->assertSame([], $response->json('data.pembayaran'));

        echo "\n[TEST] payment summary without transactions OK\n";
    }

    public function test_get_summary_with_multiple_dp_newest_first()
    {
        $project = $this->projectWithoutPaymentsWithRemaining(3000);
        if (!$project) {
            $this->markTestSkipped('Need a project without payments and enough remaining balance.');
        }

        $uuid = $project->uuid_project;
        $base = $this->projectTotal((int) $project->id_project);
        $this->assertSame(0, $base);

        $first = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
            'pelunasan' => 'dp',
            'nominal' => 1000,
        ]);
        $first->assertStatus(201);
        $this->trackFromResponse($first);

        $second = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
            'pelunasan' => 'dp',
            'nominal' => 1500,
        ]);
        $second->assertStatus(201);
        $this->trackFromResponse($second);

        $response = $this->getJson("/api/projects/uuid/{$uuid}/pembayaran");
        $response->assertStatus(200);
        $response->assertJsonPath('data.total_pembayaran', $base + 2500);
        $response->assertJsonPath('data.sisa', (int) $project->harga - ($base + 2500));
        $response->assertJsonPath('data.pelunasan', 'dp');

        $history = $response->json('data.pembayaran');
        $this->assertCount(2, $history);
        // Newest (highest id) first.
        $this->assertSame(1500, $history[0]['nominal']);
        $this->assertSame(1000, $history[1]['nominal']);

        echo "\n[TEST] payment summary with multiple DP (newest first) OK\n";
    }

    public function test_add_dp_increases_total()
    {
        $project = $this->projectWithoutPayments() ?? $this->projectWithRemaining();
        if (!$project) {
            $this->markTestSkipped('Need a project.');
        }

        $uuid = $project->uuid_project;
        $before = $this->projectTotal((int) $project->id_project);

        $response = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
            'pelunasan' => 'dp',
            'nominal' => 2500,
        ]);
        $response->assertStatus(201);
        $response->assertJsonPath('status', 'ok');
        $response->assertJsonPath('data.total_pembayaran', $before + 2500);
        $response->assertJsonPath('data.pelunasan', 'dp');

        $id = $this->trackFromResponse($response);

        $row = DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first();
        $this->assertNotNull($row);
        $this->assertSame((int) $project->id_project, (int) $row->id_project);
        $this->assertSame(2500, (int) $row->nominal);
        $this->assertSame('dp', $row->pelunasan);

        echo "\n[TEST] add DP increases total OK (payment={$id})\n";
    }

    public function test_add_lunas_equal_to_remaining()
    {
        $project = $this->projectWithRemaining();
        if (!$project) {
            $this->markTestSkipped('Need a project with remaining balance.');
        }

        $uuid = $project->uuid_project;
        $sisa = (int) $project->harga - $this->projectTotal((int) $project->id_project);

        $response = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
            'pelunasan' => 'lunas',
            'nominal' => $sisa,
        ]);
        $response->assertStatus(201);
        $response->assertJsonPath('data.total_pembayaran', (int) $project->harga);
        $response->assertJsonPath('data.sisa', 0);
        $response->assertJsonPath('data.pelunasan', 'lunas');

        $this->trackFromResponse($response);

        echo "\n[TEST] add Lunas equal to remaining OK (sisa={$sisa})\n";
    }

    public function test_reject_lunas_not_equal_to_remaining()
    {
        $project = $this->projectWithRemaining();
        if (!$project) {
            $this->markTestSkipped('Need a project with remaining balance.');
        }

        $uuid = $project->uuid_project;
        $base = $this->projectTotal((int) $project->id_project);
        $sisa = (int) $project->harga - $base;

        // Over the remaining balance.
        $over = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
            'pelunasan' => 'lunas',
            'nominal' => $sisa + 1000,
        ]);
        $over->assertStatus(422);
        $this->assertArrayHasKey('nominal', $over->json('errors'));

        // Under the remaining balance (when a valid lower amount exists).
        if ($sisa - 1000 >= 1) {
            $under = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
                'pelunasan' => 'lunas',
                'nominal' => $sisa - 1000,
            ]);
            $under->assertStatus(422);
            $this->assertArrayHasKey('nominal', $under->json('errors'));
        }

        // Nothing may have been stored.
        $this->assertSame($base, $this->projectTotal((int) $project->id_project));

        echo "\n[TEST] reject Lunas not equal to remaining OK\n";
    }

    public function test_reject_invalid_nominal()
    {
        $project = $this->projectWithoutPayments() ?? $this->projectWithRemaining();
        if (!$project) {
            $this->markTestSkipped('Need a project.');
        }

        $uuid = $project->uuid_project;
        $base = $this->projectTotal((int) $project->id_project);

        $invalidNominals = ['', '0', '-5', 'abc', '1.5', '99999999999999'];

        foreach ($invalidNominals as $nominal) {
            $response = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
                'pelunasan' => 'dp',
                'nominal' => $nominal,
            ]);
            $response->assertStatus(422, "Nominal '{$nominal}' should be rejected.");
            $this->assertArrayHasKey('nominal', $response->json('errors'));
        }

        // Missing nominal entirely.
        $missing = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
            'pelunasan' => 'dp',
        ]);
        $missing->assertStatus(422);
        $this->assertArrayHasKey('nominal', $missing->json('errors'));

        $this->assertSame($base, $this->projectTotal((int) $project->id_project));

        echo "\n[TEST] reject invalid nominal OK\n";
    }

    public function test_reject_invalid_pelunasan()
    {
        $project = $this->projectWithoutPayments() ?? $this->projectWithRemaining();
        if (!$project) {
            $this->markTestSkipped('Need a project.');
        }

        $response = $this->postForm("/api/projects/uuid/{$project->uuid_project}/pembayaran", [
            'pelunasan' => 'cicil',
            'nominal' => 1000,
        ]);
        $response->assertStatus(422);
        $this->assertArrayHasKey('pelunasan', $response->json('errors'));

        echo "\n[TEST] reject invalid pelunasan OK\n";
    }

    public function test_upload_evidence_jpg_png_pdf()
    {
        $project = $this->projectWithoutPayments() ?? $this->projectWithRemaining();
        if (!$project) {
            $this->markTestSkipped('Need a project.');
        }

        $uuid = $project->uuid_project;

        $files = [
            'bukti.jpg' => UploadedFile::fake()->create('bukti.jpg', 10, 'image/jpeg'),
            'bukti.png' => UploadedFile::fake()->create('bukti.png', 10, 'image/png'),
            'bukti.pdf' => UploadedFile::fake()->create('bukti.pdf', 10, 'application/pdf'),
        ];

        foreach ($files as $name => $file) {
            $response = $this->postForm("/api/projects/uuid/{$uuid}/pembayaran", [
                'pelunasan' => 'dp',
                'nominal' => 500,
                'bukti' => $file,
            ]);
            $response->assertStatus(201, "Upload {$name} should succeed.");

            $this->trackFromResponse($response);

            $url = $response->json('data.pembayaran.0.bukti_url');
            $this->assertNotEmpty($url, "bukti_url for {$name} must not be empty.");
            $this->assertStringContainsString('/files/', $url);

            $relative = $this->trackProofUrl($url);
            $this->assertNotNull($relative);
            $this->assertTrue(
                Storage::disk($this->disk)->exists($relative),
                "Physical proof file for {$name} should exist."
            );

            // The database stores the URL, never binary data.
            $id = (int) $response->json('data.pembayaran.0.id');
            $row = DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first();
            $this->assertSame($url, $row->bukti_tf);
            $this->assertLessThanOrEqual(100, strlen($row->bukti_tf));
        }

        echo "\n[TEST] upload evidence JPG/PNG/PDF OK\n";
    }

    public function test_reject_invalid_evidence_type()
    {
        $project = $this->projectWithoutPayments() ?? $this->projectWithRemaining();
        if (!$project) {
            $this->markTestSkipped('Need a project.');
        }

        $response = $this->postForm("/api/projects/uuid/{$project->uuid_project}/pembayaran", [
            'pelunasan' => 'dp',
            'nominal' => 500,
            'bukti' => UploadedFile::fake()->create('malware.exe', 5, 'application/x-msdownload'),
        ]);
        $response->assertStatus(422);
        $this->assertArrayHasKey('bukti', $response->json('errors'));

        echo "\n[TEST] reject invalid evidence type OK\n";
    }

    public function test_payment_without_evidence_allowed()
    {
        $project = $this->projectWithoutPayments() ?? $this->projectWithRemaining();
        if (!$project) {
            $this->markTestSkipped('Need a project.');
        }

        $response = $this->postForm("/api/projects/uuid/{$project->uuid_project}/pembayaran", [
            'pelunasan' => 'dp',
            'nominal' => 750,
        ]);
        $response->assertStatus(201);
        $this->trackFromResponse($response);
        $this->assertSame('', $response->json('data.pembayaran.0.bukti_tf'));
        $this->assertNull($response->json('data.pembayaran.0.bukti_url'));

        echo "\n[TEST] payment without evidence allowed OK\n";
    }

    public function test_payments_are_isolated_per_project()
    {
        [$a, $b] = $this->twoProjects();
        if (!$a || !$b) {
            $this->markTestSkipped('Need two projects to test isolation.');
        }

        $beforeB = $this->projectTotal((int) $b->id_project);

        $response = $this->postForm("/api/projects/uuid/{$a->uuid_project}/pembayaran", [
            'pelunasan' => 'dp',
            'nominal' => 1234,
        ]);
        $response->assertStatus(201);
        $this->trackFromResponse($response);

        // Project B must be untouched.
        $this->assertSame($beforeB, $this->projectTotal((int) $b->id_project));
        $bResponse = $this->getJson("/api/projects/uuid/{$b->uuid_project}/pembayaran");
        $bResponse->assertStatus(200);
        $this->assertSame($beforeB, $bResponse->json('data.total_pembayaran'));

        echo "\n[TEST] payments isolated per project OK\n";
    }

    public function test_payload_id_project_is_ignored()
    {
        [$a, $b] = $this->twoProjects();
        if (!$a || !$b) {
            $this->markTestSkipped('Need two projects.');
        }

        // Send a foreign id_project in the payload: backend must ignore it and
        // use the id resolved from the URL uuid.
        $response = $this->postForm("/api/projects/uuid/{$a->uuid_project}/pembayaran", [
            'pelunasan' => 'dp',
            'nominal' => 900,
            'id_project' => $b->id_project,
        ]);
        $response->assertStatus(201);

        $id = $this->trackFromResponse($response);
        $row = DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first();
        $this->assertSame((int) $a->id_project, (int) $row->id_project);

        echo "\n[TEST] payload id_project ignored OK\n";
    }

    public function test_unknown_uuid_returns_404()
    {
        $this->getJson('/api/projects/uuid/thisuuiddoesnotexist000000000/pembayaran')
            ->assertStatus(404);

        $this->postForm('/api/projects/uuid/thisuuiddoesnotexist000000000/pembayaran', [
            'pelunasan' => 'dp',
            'nominal' => 1000,
        ])->assertStatus(404);

        echo "\n[TEST] unknown uuid 404 OK\n";
    }

    public function test_unauthenticated_cannot_access_payments()
    {
        auth()->logout();

        $this->getJson('/api/projects/uuid/whatever/pembayaran')->assertStatus(401);
        $this->postForm('/api/projects/uuid/whatever/pembayaran', [
            'pelunasan' => 'dp',
            'nominal' => 1000,
        ])->assertStatus(401);

        echo "\n[TEST] unauthenticated payment access 401 OK\n";
    }
}
