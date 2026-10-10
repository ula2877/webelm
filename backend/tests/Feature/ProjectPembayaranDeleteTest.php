<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Functional test for deleting a single tb_pembayaran row together with its
 * bukti_tf file (only when the file is not referenced by any other data).
 *
 *   DELETE /api/projects/uuid/{uuid}/pembayaran/{paymentId}
 *
 * Follows ProjectPembayaranTest: NO database refresh, the real MySQL
 * `webelmech` database is used and every row/file created here is cleaned up
 * even when an assertion fails.
 */
class ProjectPembayaranDeleteTest extends TestCase
{
    protected $connectionsToTransact = [];

    private string $disk;
    private string $directory;

    /** @var int[] */
    private array $createdPaymentIds = [];
    /** @var int[] */
    private array $createdFileIds = [];
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

        if (!empty($this->createdFileIds)) {
            DB::table('tb_files')->whereIn('id', $this->createdFileIds)->delete();
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

    private function firstProject()
    {
        return DB::table('tb_project')->orderBy('id_project')->first();
    }

    private function secondProject()
    {
        $rows = DB::table('tb_project')->orderBy('id_project')->limit(2)->get()->all();

        return $rows[1] ?? null;
    }

    /** First project with no payments and at least $min of harga. */
    private function projectWithoutPaymentsWithRemaining(int $min)
    {
        return DB::table('tb_project')->orderBy('id_project')->get()->first(function ($p) use ($min) {
            if (DB::table('tb_pembayaran')->where('id_project', $p->id_project)->exists()) {
                return false;
            }

            return (int) $p->harga >= $min;
        });
    }

    private function publicUrl(string $name): string
    {
        $base = rtrim((string) config('elmech.project_file_url.base_url', config('app.url')), '/');
        $prefix = trim((string) config('elmech.project_file_url.prefix', 'files'), '/');

        return $base . '/' . $prefix . '/' . $name;
    }

    /** Create a physical proof file; returns [relativePath, absoluteUrl]. */
    private function putProof(string $ext = 'pdf'): array
    {
        $name = bin2hex(random_bytes(16)) . '.' . $ext;
        $relative = $this->directory . '/' . $name;
        Storage::disk($this->disk)->put($relative, 'proof-content');
        $this->createdPaths[] = $relative;

        return [$relative, $this->publicUrl($name)];
    }

    /** Insert a tb_pembayaran row directly and track it. */
    private function createPayment(int $projectId, int $nominal, string $pelunasan, string $bukti = ''): int
    {
        $id = (int) DB::table('tb_pembayaran')->insertGetId([
            'id_project' => $projectId,
            'nominal' => $nominal,
            'bukti_tf' => $bukti,
            'pelunasan' => $pelunasan,
        ]);
        $this->createdPaymentIds[] = $id;

        return $id;
    }

    public function test_delete_dp_with_evidence_removes_record_and_file()
    {
        $project = $this->firstProject();
        [$relative, $url] = $this->putProof('pdf');
        $id = $this->createPayment((int) $project->id_project, 5000, 'dp', $url);
        $this->assertTrue(Storage::disk($this->disk)->exists($relative));

        $res = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$id}");
        $res->assertStatus(200);
        $res->assertJsonPath('status', 'ok');
        $this->assertTrue($res->json('data.file_deleted'));

        $this->assertNull(DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first());
        $this->assertFalse(Storage::disk($this->disk)->exists($relative));

        echo "\n[TEST] delete DP with evidence OK (payment={$id})\n";
    }

    public function test_delete_lunas_with_evidence_removes_record_and_file()
    {
        $project = $this->firstProject();
        [$relative, $url] = $this->putProof('jpg');
        $id = $this->createPayment((int) $project->id_project, 9000, 'lunas', $url);
        $this->assertTrue(Storage::disk($this->disk)->exists($relative));

        $res = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$id}");
        $res->assertStatus(200);
        $this->assertTrue($res->json('data.file_deleted'));

        $this->assertNull(DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first());
        $this->assertFalse(Storage::disk($this->disk)->exists($relative));

        echo "\n[TEST] delete Lunas with evidence OK\n";
    }

    public function test_delete_payment_without_evidence()
    {
        $project = $this->firstProject();
        $id = $this->createPayment((int) $project->id_project, 1000, 'dp', '');

        $res = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$id}");
        $res->assertStatus(200);
        $this->assertFalse($res->json('data.file_deleted'));
        $this->assertFalse($res->json('data.file_failed'));
        $this->assertNull(DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first());

        echo "\n[TEST] delete payment without evidence OK\n";
    }

    public function test_recompute_total_and_sisa_after_delete()
    {
        $project = $this->projectWithoutPaymentsWithRemaining(3000);
        if (!$project) {
            $this->markTestSkipped('Need a project without payments.');
        }

        $uuid = $project->uuid_project;
        $harga = (int) $project->harga;

        $a = $this->createPayment((int) $project->id_project, 1000, 'dp', '');
        $b = $this->createPayment((int) $project->id_project, 2000, 'dp', '');

        $res = $this->deleteJson("/api/projects/uuid/{$uuid}/pembayaran/{$a}");
        $res->assertStatus(200);

        $summary = $res->json('data.summary');
        $this->assertSame(2000, $summary['total_pembayaran']);
        $this->assertSame($harga - 2000, $summary['sisa']);
        $this->assertSame('dp', $summary['pelunasan']);

        // And the GET endpoint agrees (data terbaru dari backend).
        $get = $this->getJson("/api/projects/uuid/{$uuid}/pembayaran");
        $get->assertJsonPath('data.total_pembayaran', 2000);
        $get->assertJsonPath('data.sisa', $harga - 2000);

        // Cleanup of the surviving row happens in tearDown via createdPaymentIds.
        $this->assertNotNull(DB::table('tb_pembayaran')->where('id_pembayaran', $b)->first());

        echo "\n[TEST] recompute total & sisa after delete OK\n";
    }

    public function test_deleting_lunas_restores_non_lunas_summary()
    {
        $project = $this->projectWithoutPaymentsWithRemaining(2000);
        if (!$project) {
            $this->markTestSkipped('Need a project without payments.');
        }

        $uuid = $project->uuid_project;
        $harga = (int) $project->harga;
        $projectId = (int) $project->id_project;

        $this->createPayment($projectId, 1000, 'dp', '');
        $lunasId = $this->createPayment($projectId, $harga - 1000, 'lunas', '');

        // Before deletion the summary is fully paid.
        $before = $this->getJson("/api/projects/uuid/{$uuid}/pembayaran");
        $before->assertJsonPath('data.total_pembayaran', $harga);
        $before->assertJsonPath('data.sisa', 0);
        $before->assertJsonPath('data.pelunasan', 'lunas');

        $res = $this->deleteJson("/api/projects/uuid/{$uuid}/pembayaran/{$lunasId}");
        $res->assertStatus(200);

        $summary = $res->json('data.summary');
        $this->assertSame(1000, $summary['total_pembayaran']);
        $this->assertSame($harga - 1000, $summary['sisa']);
        $this->assertSame('dp', $summary['pelunasan']);

        echo "\n[TEST] deleting Lunas restores dp summary OK\n";
    }

    public function test_shared_file_is_kept_until_last_reference_removed()
    {
        $project = $this->firstProject();
        [$relative, $url] = $this->putProof('pdf');

        $p1 = $this->createPayment((int) $project->id_project, 1000, 'dp', $url);
        $p2 = $this->createPayment((int) $project->id_project, 2000, 'dp', $url);

        // Delete P1 -> file still referenced by P2.
        $res1 = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$p1}");
        $res1->assertStatus(200);
        $this->assertFalse($res1->json('data.file_deleted'));
        $this->assertTrue($res1->json('data.file_referenced'));
        $this->assertTrue(Storage::disk($this->disk)->exists($relative));
        $this->assertNotNull(DB::table('tb_pembayaran')->where('id_pembayaran', $p2)->first());

        // Delete P2 -> now the file is exclusive, it is removed.
        $res2 = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$p2}");
        $res2->assertStatus(200);
        $this->assertTrue($res2->json('data.file_deleted'));
        $this->assertFalse(Storage::disk($this->disk)->exists($relative));

        echo "\n[TEST] shared proof file kept until last reference removed OK\n";
    }

    public function test_file_referenced_by_tb_files_is_kept()
    {
        $project = $this->firstProject();
        [$relative, $url] = $this->putProof('pdf');
        $name = basename($relative);

        // A tb_files row (project file / progress attachment) points at the
        // same physical file.
        $fileId = (int) DB::table('tb_files')->insertGetId([
            'id_parent' => $project->id_project,
            'sender' => auth()->id(),
            'datetime' => now(),
            'path' => $relative,
        ]);
        $this->createdFileIds[] = $fileId;

        $id = $this->createPayment((int) $project->id_project, 1000, 'dp', $url);

        $res = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$id}");
        $res->assertStatus(200);
        $this->assertFalse($res->json('data.file_deleted'));
        $this->assertTrue($res->json('data.file_referenced'));
        $this->assertTrue(Storage::disk($this->disk)->exists($relative));
        $this->assertNull(DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first());
        $this->assertNotNull(DB::table('tb_files')->where('id', $fileId)->first());

        echo "\n[TEST] proof file shared with tb_files kept OK ({$name})\n";
    }

    public function test_payment_of_other_project_cannot_be_deleted()
    {
        $project = $this->firstProject();
        $other = $this->secondProject();
        if (!$other) {
            $this->markTestSkipped('Need a second project.');
        }

        [$relative, $url] = $this->putProof('pdf');
        $foreignId = $this->createPayment((int) $other->id_project, 4000, 'dp', $url);

        // Delete through project A's uuid -> 404, row + file untouched.
        $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$foreignId}")
            ->assertStatus(404);

        $this->assertNotNull(DB::table('tb_pembayaran')->where('id_pembayaran', $foreignId)->first());
        $this->assertTrue(Storage::disk($this->disk)->exists($relative));

        echo "\n[TEST] cross-project payment delete blocked (404) OK\n";
    }

    public function test_missing_physical_file_does_not_fail()
    {
        $project = $this->firstProject();
        // Valid URL shape, but the physical file does not exist.
        $url = $this->publicUrl(bin2hex(random_bytes(16)) . '.pdf');
        $id = $this->createPayment((int) $project->id_project, 1000, 'dp', $url);

        $res = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$id}");
        $res->assertStatus(200);
        $this->assertFalse($res->json('data.file_deleted'));
        $this->assertFalse($res->json('data.file_failed'));
        $this->assertNull(DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first());

        echo "\n[TEST] missing physical file handled gracefully OK\n";
    }

    public function test_unmappable_url_is_not_deleted_from_disk()
    {
        $project = $this->firstProject();

        // File physically inside storage, but the stored URL points elsewhere:
        // it must never be deleted through this endpoint.
        $outside = 'other-dir/secret_' . uniqid() . '.pdf';
        Storage::disk($this->disk)->put($outside, 'secret');
        $this->createdPaths[] = $outside;

        $id = $this->createPayment(
            (int) $project->id_project,
            1000,
            'dp',
            'https://external.example.com/other/secret.pdf'
        );

        $res = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$id}");
        $res->assertStatus(200);
        $this->assertFalse($res->json('data.file_deleted'));
        $this->assertNull(DB::table('tb_pembayaran')->where('id_pembayaran', $id)->first());
        $this->assertTrue(Storage::disk($this->disk)->exists($outside));

        echo "\n[TEST] unmappable proof URL not deleted OK\n";
    }

    public function test_unknown_payment_and_uuid_404()
    {
        $project = $this->firstProject();

        $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/999999999")
            ->assertStatus(404);
        $this->deleteJson('/api/projects/uuid/thisuuiddoesnotexist000000000/pembayaran/1')
            ->assertStatus(404);

        echo "\n[TEST] unknown payment/uuid 404 OK\n";
    }

    public function test_no_schema_change_and_add_still_works()
    {
        // Tutup regresi: struktur kolom tb_pembayaran tidak berubah.
        $this->assertSame(
            ['id_pembayaran', 'id_project', 'nominal', 'bukti_tf', 'pelunasan'],
            Schema::getColumnListing('tb_pembayaran')
        );

        $project = $this->firstProject();
        [$relative, $url] = $this->putProof('pdf');
        $id = $this->createPayment((int) $project->id_project, 1000, 'dp', $url);
        $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/pembayaran/{$id}")->assertStatus(200);

        // Menambah pembayaran baru tetap berfungsi setelah penghapusan.
        $res = $this->post(
            "/api/projects/uuid/{$project->uuid_project}/pembayaran",
            ['pelunasan' => 'dp', 'nominal' => 777],
            ['Accept' => 'application/json']
        );
        $res->assertStatus(201);
        $this->createdPaymentIds[] = (int) $res->json('data.pembayaran.0.id');

        echo "\n[TEST] schema unchanged + add still works OK\n";
    }

    public function test_unauthenticated_cannot_delete()
    {
        auth()->logout();

        $this->deleteJson('/api/projects/uuid/whatever/pembayaran/1')->assertStatus(401);

        echo "\n[TEST] unauthenticated delete payment 401 OK\n";
    }
}
