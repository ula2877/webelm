<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Functional test for the Project File Manager (tb_files).
 *
 * Follows QuotationSavePdfTest: NO database refresh, we only use existing
 * tables and clean up every row/file we create (even when an assertion fails).
 */
class ProjectFileManagerTest extends TestCase
{
    protected $connectionsToTransact = [];

    private string $disk;
    private string $directory;

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

        parent::tearDown();
    }

    private function firstProject()
    {
        return DB::table('tb_project')->orderBy('id_project')->first();
    }

    private function otherProject()
    {
        return DB::table('tb_project')->orderBy('id_project')->skip(1)->first();
    }

    private function track(int $fileId, string $path): void
    {
        $this->createdFileIds[] = $fileId;
        $this->createdPaths[] = $path;
    }

    public function test_full_file_manager_flow()
    {
        $project = $this->firstProject();
        $this->assertNotNull($project, 'Need at least one project to test.');
        $uuid = $project->uuid_project;
        $senderId = auth()->id();

        // --- 1. list is empty ---
        $list = $this->getJson("/api/projects/uuid/{$uuid}/files");
        $list->assertStatus(200);
        $this->assertSame('ok', $list->json('status'));
        $this->assertSame(0, count($list->json('data')));

        // --- 2. upload a PDF ---
        $pdf = UploadedFile::fake()->create('laporan project.pdf', 40, 'application/pdf');
        $upload = $this->postJson("/api/projects/uuid/{$uuid}/files", ['file' => $pdf]);
        $upload->assertStatus(201);
        $upload->assertJsonPath('status', 'ok');
        $pdfId = $upload->json('data.id');
        $this->assertNotEmpty($pdfId);

        $row = DB::table('tb_files')->where('id', $pdfId)->first();
        $this->assertNotNull($row);
        $this->track((int) $pdfId, $row->path);
        $this->assertSame((int) $project->id_project, (int) $row->id_parent);
        $this->assertSame((int) $senderId, (int) $row->sender);
        $this->assertNotNull($row->datetime);
        $this->assertStringStartsWith($this->directory . '/', $row->path);
        $this->assertFileExists(Storage::disk($this->disk)->path($row->path));

        // --- 3. upload an image ---
        $img = UploadedFile::fake()->create('bukti foto.jpg', 10, 'image/jpeg');
        $uploadImg = $this->postJson("/api/projects/uuid/{$uuid}/files", ['file' => $img]);
        $uploadImg->assertStatus(201);
        $imgId = $uploadImg->json('data.id');
        $imgRow = DB::table('tb_files')->where('id', $imgId)->first();
        $this->track((int) $imgId, $imgRow->path);
        $this->assertSame('jpg', $uploadImg->json('data.extension'));

        // --- 4. list now returns both, newest first ---
        $list2 = $this->getJson("/api/projects/uuid/{$uuid}/files");
        $list2->assertStatus(200);
        $data = $list2->json('data');
        $this->assertSame(2, count($data));
        $this->assertTrue($data[0]['id'] >= $data[1]['id'], 'Files should be ordered newest first.');

        // --- 5. download/view endpoint works ---
        $download = $this->get("/api/projects/uuid/{$uuid}/files/{$pdfId}");
        $download->assertStatus(200);

        // --- 6. cross-project isolation: other project cannot see/delete ---
        $other = $this->otherProject();
        if ($other) {
            $otherUuid = $other->uuid_project;
            $this->get("/api/projects/uuid/{$otherUuid}/files/{$pdfId}")->assertStatus(404);
            $this->deleteJson("/api/projects/uuid/{$otherUuid}/files/{$pdfId}")->assertStatus(404);
            // Record still present after the failed cross-project delete.
            $this->assertNotNull(DB::table('tb_files')->where('id', $pdfId)->first());
        }

        // --- 7. delete one file (record + physical file) ---
        $path = $row->path;
        $del = $this->deleteJson("/api/projects/uuid/{$uuid}/files/{$pdfId}");
        $del->assertStatus(200);
        $this->assertNull(DB::table('tb_files')->where('id', $pdfId)->first());
        $this->assertFileDoesNotExist(Storage::disk($this->disk)->path($path));
        $this->createdFileIds = array_values(array_diff($this->createdFileIds, [$pdfId]));
        $this->createdPaths = array_values(array_diff($this->createdPaths, [$path]));

        // Second file is untouched.
        $this->assertNotNull(DB::table('tb_files')->where('id', $imgId)->first());

        echo "\n[TEST] file manager full flow OK (pdf={$pdfId}, img={$imgId})\n";
    }

    public function test_upload_rejects_disallowed_type()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        $bad = UploadedFile::fake()->create('malware.exe', 5, 'application/x-msdownload');
        $response = $this->postJson("/api/projects/uuid/{$uuid}/files", ['file' => $bad]);
        $response->assertStatus(422);
        echo "\n[TEST] disallowed type 422 OK\n";
    }

    public function test_upload_rejects_oversize()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        // Backend max is 20480 KB; ask for 25000 KB.
        $big = UploadedFile::fake()->create('big.pdf', 25000, 'application/pdf');
        $response = $this->postJson("/api/projects/uuid/{$uuid}/files", ['file' => $big]);
        $response->assertStatus(422);
        echo "\n[TEST] oversize 422 OK\n";
    }

    public function test_unknown_project_uuid_404()
    {
        $pdf = UploadedFile::fake()->create('x.pdf', 5, 'application/pdf');
        $this->getJson('/api/projects/uuid/thisuuiddoesnotexist000000000/files')->assertStatus(404);
        $this->postJson('/api/projects/uuid/thisuuiddoesnotexist000000000/files', ['file' => $pdf])
            ->assertStatus(404);
        echo "\n[TEST] unknown uuid 404 OK\n";
    }

    public function test_unauthenticated_cannot_list_files()
    {
        // Reset authentication for this test.
        auth()->logout();
        $project = $this->firstProject();
        $this->getJson("/api/projects/uuid/{$project->uuid_project}/files")->assertStatus(401);
        echo "\n[TEST] unauthenticated 401 OK\n";
    }
}
