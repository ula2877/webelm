<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Functional test for deleting a single tb_progress row together with its
 * tb_files records and the physical files (only when no other progress still
 * references them).
 *
 * Follows ProjectProgressTest: NO database refresh, the real MySQL `webelmech`
 * database is used and every row/file created here is cleaned up even when an
 * assertion fails.
 */
class ProjectProgressDeleteTest extends TestCase
{
    protected $connectionsToTransact = [];

    private string $disk;
    private string $directory;

    /** @var int[] */
    private array $createdProgressIds = [];
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

        if (!empty($this->createdProgressIds)) {
            DB::table('tb_progress')->whereIn('id', $this->createdProgressIds)->delete();
        }

        parent::tearDown();
    }

    private function firstProject()
    {
        return DB::table('tb_project')->orderBy('id_project')->first();
    }

    private function secondProject()
    {
        return DB::table('tb_project')->orderBy('id_project')->skip(1)->first();
    }

    /** Multipart POST that always asks for a JSON response. */
    private function postForm(string $uri, array $data)
    {
        return $this->post($uri, $data, ['Accept' => 'application/json']);
    }

    /** Track the tb_files rows returned by an upload so tearDown can clean up. */
    private function trackAttachments(array $files): void
    {
        foreach ($files as $file) {
            $this->createdFileIds[] = (int) $file['id'];
            $this->createdPaths[] = $this->directory . '/' . $file['name'];
        }
    }

    /** Create a progress row (optionally with attachments) through the API. */
    private function createProgress(string $uuid, int $progress, string $deskripsi, array $files = []): array
    {
        $payload = ['progress' => $progress, 'deskripsi' => $deskripsi];
        if (!empty($files)) {
            $payload['files'] = $files;
        }

        $response = $this->postForm("/api/projects/uuid/{$uuid}/progress", $payload);
        $response->assertStatus(201);

        $data = $response->json('data');
        $this->createdProgressIds[] = (int) $data['id'];
        $this->trackAttachments($data['files'] ?? []);

        return $data;
    }

    /** Physical path (on the disk) of a tb_files row. */
    private function physicalPath(int $fileId): string
    {
        $row = DB::table('tb_files')->where('id', $fileId)->first();
        $this->assertNotNull($row, "tb_files {$fileId} missing");
        $name = basename((string) parse_url($row->path, PHP_URL_PATH) ?: $row->path);

        return $this->directory . '/' . $name;
    }

    private function pdf(string $name, int $kb = 10): UploadedFile
    {
        return UploadedFile::fake()->create($name, $kb, 'application/pdf');
    }

    public function test_delete_progress_without_files()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        $created = $this->createProgress($uuid, 40, 'Progress tanpa lampiran.');
        $progressId = (int) $created['id'];
        $this->assertNotNull(DB::table('tb_progress')->where('id', $progressId)->first());

        $response = $this->deleteJson("/api/projects/uuid/{$uuid}/progress/{$progressId}");
        $response->assertStatus(200);
        $response->assertJsonPath('status', 'ok');
        $response->assertJsonPath('data.id', $progressId);
        $this->assertSame([], $response->json('data.deleted_files'));
        $this->assertSame([], $response->json('data.files_failed'));

        $this->assertNull(DB::table('tb_progress')->where('id', $progressId)->first());

        echo "\n[TEST] delete progress without files OK\n";
    }

    public function test_delete_progress_with_single_file()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        $created = $this->createProgress($uuid, 55, 'Satu lampiran.', [$this->pdf('satu.pdf')]);
        $progressId = (int) $created['id'];
        $fileId = (int) $created['files'][0]['id'];
        $path = $this->physicalPath($fileId);
        $this->assertTrue(Storage::disk($this->disk)->exists($path));

        $response = $this->deleteJson("/api/projects/uuid/{$uuid}/progress/{$progressId}");
        $response->assertStatus(200);
        $this->assertContains($fileId, $response->json('data.deleted_files'));

        // Record progress + file + file fisik benar-benar hilang.
        $this->assertNull(DB::table('tb_progress')->where('id', $progressId)->first());
        $this->assertNull(DB::table('tb_files')->where('id', $fileId)->first());
        $this->assertFalse(Storage::disk($this->disk)->exists($path));

        echo "\n[TEST] delete progress with single file OK (file={$fileId})\n";
    }

    public function test_delete_progress_with_multiple_files()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        $created = $this->createProgress($uuid, 70, 'Tiga lampiran.', [
            $this->pdf('a.pdf'),
            $this->pdf('b.pdf'),
            $this->pdf('c.pdf'),
        ]);
        $progressId = (int) $created['id'];
        $fileIds = array_map(fn ($f) => (int) $f['id'], $created['files']);
        $this->assertCount(3, $fileIds);

        $paths = [];
        foreach ($fileIds as $fileId) {
            $paths[$fileId] = $this->physicalPath($fileId);
            $this->assertTrue(Storage::disk($this->disk)->exists($paths[$fileId]));
        }

        $response = $this->deleteJson("/api/projects/uuid/{$uuid}/progress/{$progressId}");
        $response->assertStatus(200);
        $deleted = $response->json('data.deleted_files');
        foreach ($fileIds as $fileId) {
            $this->assertContains($fileId, $deleted);
            $this->assertNull(DB::table('tb_files')->where('id', $fileId)->first());
            $this->assertFalse(Storage::disk($this->disk)->exists($paths[$fileId]));
        }
        $this->assertNull(DB::table('tb_progress')->where('id', $progressId)->first());

        echo "\n[TEST] delete progress with multiple files OK\n";
    }

    public function test_shared_file_kept_until_last_reference_removed()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        // Progress A owns file X.
        $a = $this->createProgress($uuid, 30, 'Progress A.', [$this->pdf('shared.pdf')]);
        $aId = (int) $a['id'];
        $fileX = (int) $a['files'][0]['id'];
        $path = $this->physicalPath($fileX);

        // Progress B (same project) references the SAME file id.
        $bId = (int) DB::table('tb_progress')->insertGetId([
            'id_project' => $project->id_project,
            'id_file' => json_encode([$fileX]),
            'progress' => 60,
            'deskripsi' => 'Progress B memakai file yang sama.',
            'created_at' => now(),
        ]);
        $this->createdProgressIds[] = $bId;

        // Delete A -> X must survive (still referenced by B).
        $resA = $this->deleteJson("/api/projects/uuid/{$uuid}/progress/{$aId}");
        $resA->assertStatus(200);
        $this->assertSame([], $resA->json('data.deleted_files'));
        $this->assertContains($fileX, $resA->json('data.kept_files'));
        $this->assertNotNull(DB::table('tb_files')->where('id', $fileX)->first());
        $this->assertTrue(Storage::disk($this->disk)->exists($path));
        $this->assertNotNull(DB::table('tb_progress')->where('id', $bId)->first());

        // Delete B -> now the last reference is gone, file is removed.
        $resB = $this->deleteJson("/api/projects/uuid/{$uuid}/progress/{$bId}");
        $resB->assertStatus(200);
        $this->assertContains($fileX, $resB->json('data.deleted_files'));
        $this->assertNull(DB::table('tb_files')->where('id', $fileX)->first());
        $this->assertFalse(Storage::disk($this->disk)->exists($path));

        echo "\n[TEST] shared file kept until last reference removed OK\n";
    }

    public function test_file_referenced_by_other_project_progress_is_kept()
    {
        $project = $this->firstProject();
        $other = $this->secondProject();
        if (!$other) {
            $this->markTestSkipped('Need a second project to test cross-project sharing.');
        }

        $a = $this->createProgress($project->uuid_project, 45, 'Progress projek A.', [$this->pdf('cross.pdf')]);
        $aId = (int) $a['id'];
        $fileX = (int) $a['files'][0]['id'];
        $path = $this->physicalPath($fileX);

        // A progress row on ANOTHER project references the same file id.
        $foreignProgress = (int) DB::table('tb_progress')->insertGetId([
            'id_project' => $other->id_project,
            'id_file' => json_encode([$fileX]),
            'progress' => 20,
            'deskripsi' => 'Referensi lintas projek.',
            'created_at' => now(),
        ]);
        $this->createdProgressIds[] = $foreignProgress;

        $response = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/progress/{$aId}");
        $response->assertStatus(200);
        $this->assertSame([], $response->json('data.deleted_files'));
        $this->assertContains($fileX, $response->json('data.kept_files'));

        // File record + physical file tetap ada karena masih dipakai.
        $this->assertNotNull(DB::table('tb_files')->where('id', $fileX)->first());
        $this->assertTrue(Storage::disk($this->disk)->exists($path));

        echo "\n[TEST] file shared with another project kept OK\n";
    }

    public function test_foreign_file_owned_by_other_project_is_never_touched()
    {
        $project = $this->firstProject();
        $other = $this->secondProject();
        if (!$other) {
            $this->markTestSkipped('Need a second project to test foreign file isolation.');
        }

        // Physical file + tb_files row owned by ANOTHER project.
        $foreignName = 'foreign_' . uniqid() . '.pdf';
        $foreignPath = $this->directory . '/' . $foreignName;
        Storage::disk($this->disk)->put($foreignPath, 'foreign-content');
        $this->createdPaths[] = $foreignPath;

        $foreignFileId = (int) DB::table('tb_files')->insertGetId([
            'id_parent' => $other->id_project,
            'sender' => auth()->id(),
            'datetime' => now(),
            'path' => $foreignPath,
        ]);
        $this->createdFileIds[] = $foreignFileId;

        // Progress on project A (wrongly) references that foreign file id.
        $progressId = (int) DB::table('tb_progress')->insertGetId([
            'id_project' => $project->id_project,
            'id_file' => json_encode([$foreignFileId]),
            'progress' => 33,
            'deskripsi' => 'Referensi file asing.',
            'created_at' => now(),
        ]);
        $this->createdProgressIds[] = $progressId;

        $response = $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/progress/{$progressId}");
        $response->assertStatus(200);
        // Foreign file is not even considered deletable.
        $this->assertSame([], $response->json('data.deleted_files'));
        $this->assertNotContains($foreignFileId, $response->json('data.kept_files'));

        $this->assertNotNull(DB::table('tb_files')->where('id', $foreignFileId)->first());
        $this->assertTrue(Storage::disk($this->disk)->exists($foreignPath));

        echo "\n[TEST] foreign file owned by another project untouched OK\n";
    }

    public function test_missing_physical_file_does_not_fail_whole_request()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        $created = $this->createProgress($uuid, 80, 'File sudah hilang.', [$this->pdf('gone.pdf')]);
        $progressId = (int) $created['id'];
        $fileId = (int) $created['files'][0]['id'];
        $path = $this->physicalPath($fileId);

        // Simulate the file disappearing from storage before deletion.
        Storage::disk($this->disk)->delete($path);
        $this->assertFalse(Storage::disk($this->disk)->exists($path));

        $response = $this->deleteJson("/api/projects/uuid/{$uuid}/progress/{$progressId}");
        $response->assertStatus(200);
        $response->assertJsonPath('status', 'ok');
        $this->assertSame([], $response->json('data.files_failed'));
        $this->assertNull(DB::table('tb_progress')->where('id', $progressId)->first());
        $this->assertNull(DB::table('tb_files')->where('id', $fileId)->first());

        echo "\n[TEST] missing physical file handled gracefully OK\n";
    }

    public function test_unmappable_path_is_not_deleted_from_disk()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        // A physical file OUTSIDE the allowed project-file directory.
        $outside = 'other-dir/secret_' . uniqid() . '.txt';
        Storage::disk($this->disk)->put($outside, 'secret');
        $this->createdPaths[] = $outside;

        $fileId = (int) DB::table('tb_files')->insertGetId([
            'id_parent' => $project->id_project,
            'sender' => auth()->id(),
            'datetime' => now(),
            'path' => $outside,
        ]);
        $this->createdFileIds[] = $fileId;

        $progressId = (int) DB::table('tb_progress')->insertGetId([
            'id_project' => $project->id_project,
            'id_file' => json_encode([$fileId]),
            'progress' => 15,
            'deskripsi' => 'Path di luar folder.',
            'created_at' => now(),
        ]);
        $this->createdProgressIds[] = $progressId;

        $response = $this->deleteJson("/api/projects/uuid/{$uuid}/progress/{$progressId}");
        $response->assertStatus(200);

        // DB record is removed, but the out-of-directory file is untouched.
        $this->assertNull(DB::table('tb_files')->where('id', $fileId)->first());
        $this->assertTrue(Storage::disk($this->disk)->exists($outside));

        echo "\n[TEST] unmappable path not deleted from disk OK\n";
    }

    public function test_progress_of_other_project_returns_404()
    {
        $project = $this->firstProject();
        $other = $this->secondProject();
        if (!$other) {
            $this->markTestSkipped('Need a second project to test cross-project protection.');
        }

        // Progress that belongs to the OTHER project.
        $foreignProgress = (int) DB::table('tb_progress')->insertGetId([
            'id_project' => $other->id_project,
            'id_file' => null,
            'progress' => 25,
            'deskripsi' => 'Milik projek lain.',
            'created_at' => now(),
        ]);
        $this->createdProgressIds[] = $foreignProgress;

        // Try to delete it through project A's uuid -> 404, row must survive.
        $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/progress/{$foreignProgress}")
            ->assertStatus(404);
        $this->assertNotNull(DB::table('tb_progress')->where('id', $foreignProgress)->first());

        echo "\n[TEST] cross-project progress delete blocked (404) OK\n";
    }

    public function test_unknown_progress_and_uuid_404()
    {
        $project = $this->firstProject();

        $this->deleteJson("/api/projects/uuid/{$project->uuid_project}/progress/999999999")
            ->assertStatus(404);
        $this->deleteJson("/api/projects/uuid/thisuuiddoesnotexist000000000/progress/1")
            ->assertStatus(404);

        echo "\n[TEST] unknown progress/uuid 404 OK\n";
    }

    public function test_unauthenticated_cannot_delete_progress()
    {
        auth()->logout();

        $this->deleteJson('/api/projects/uuid/whatever/progress/1')->assertStatus(401);

        echo "\n[TEST] unauthenticated delete progress 401 OK\n";
    }
}
