<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Functional test for Project Progress (tb_progress) including multi-file
 * attachments stored in tb_files.
 *
 * Follows ProjectFileManagerTest: NO database refresh, we only use existing
 * tables and clean up every row/file we create (even when an assertion fails).
 * The real MySQL `webelmech` database is used.
 */
class ProjectProgressTest extends TestCase
{
    protected $connectionsToTransact = [];

    private string $disk;
    private string $directory;

    /** @var int[] */
    private array $createdIds = [];
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

        if (!empty($this->createdIds)) {
            DB::table('tb_progress')->whereIn('id', $this->createdIds)->delete();
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

    private function track(int $id): void
    {
        $this->createdIds[] = $id;
    }

    private function trackFile(int $id, string $path): void
    {
        $this->createdFileIds[] = $id;
        $this->createdPaths[] = $path;
    }

    private function findProgress(array $data, int $id): ?array
    {
        foreach ($data as $row) {
            if ((int) $row['id'] === $id) {
                return $row;
            }
        }

        return null;
    }

    /**
     * Multipart POST (menyertakan file) yang tetap meminta respons JSON,
     * sehingga error validasi = 422 dan unauthenticated = 401.
     */
    private function postForm(string $uri, array $data)
    {
        return $this->post($uri, $data, ['Accept' => 'application/json']);
    }

    public function test_full_progress_flow()
    {
        $project = $this->firstProject();
        $this->assertNotNull($project, 'Need at least one project to test.');
        $uuid = $project->uuid_project;

        // Ensure a clean starting point for this project.
        $this->assertSame(
            0,
            DB::table('tb_progress')->where('id_project', $project->id_project)->count(),
            'Test expects a project without progress rows.'
        );

        // --- 1. initially empty, latest null ---
        $list = $this->getJson("/api/projects/uuid/{$uuid}/progress");
        $list->assertStatus(200);
        $this->assertSame('ok', $list->json('status'));
        $this->assertSame(0, count($list->json('data')));
        $this->assertNull($list->json('meta.latest'));

        // --- 2. add 35% (no files) ---
        $first = $this->postForm("/api/projects/uuid/{$uuid}/progress", [
            'progress' => 35,
            'deskripsi' => 'Pondasi dan struktur selesai.',
        ]);
        $first->assertStatus(201);
        $first->assertJsonPath('status', 'ok');
        $firstId = $first->json('data.id');
        $this->assertNotEmpty($firstId);
        $this->track((int) $firstId);

        $row = DB::table('tb_progress')->where('id', $firstId)->first();
        $this->assertNotNull($row);
        $this->assertSame((int) $project->id_project, (int) $row->id_project);
        $this->assertSame(35, (int) $row->progress);
        $this->assertSame('Pondasi dan struktur selesai.', $row->deskripsi);
        $this->assertNull($row->id_file);
        $this->assertNotNull($row->created_at);
        // No files -> empty attachments array in the API response.
        $this->assertSame([], $first->json('data.files'));

        // --- 3. add 65% (latest = 65, NOT a sum -> 100) ---
        $second = $this->postForm("/api/projects/uuid/{$uuid}/progress", [
            'progress' => 65,
            'deskripsi' => 'Instalasi mesin berjalan.',
        ]);
        $second->assertStatus(201);
        $secondId = $second->json('data.id');
        $this->track((int) $secondId);
        $this->assertNotSame($firstId, $secondId);

        // --- 4. list is newest-first and latest is 65 ---
        $list2 = $this->getJson("/api/projects/uuid/{$uuid}/progress");
        $list2->assertStatus(200);
        $data = $list2->json('data');
        $this->assertSame(2, count($data));
        $this->assertSame(65, $data[0]['progress']);
        $this->assertSame(35, $data[1]['progress']);
        $this->assertSame(65, $list2->json('meta.latest.progress'));
        $this->assertSame(count($data), $list2->json('meta.total'));

        // --- 5. id_project from client input is ignored (never trusted) ---
        $other = $this->otherProject();
        if ($other) {
            $spoof = $this->postForm("/api/projects/uuid/{$uuid}/progress", [
                'progress' => 10,
                'deskripsi' => 'Percobaan spoof id_project.',
                'id_project' => $other->id_project,
            ]);
            $spoof->assertStatus(201);
            $spoofId = $spoof->json('data.id');
            $this->track((int) $spoofId);
            $spoofRow = DB::table('tb_progress')->where('id', $spoofId)->first();
            // Stored against the URL project, NOT the spoofed id_project.
            $this->assertSame((int) $project->id_project, (int) $spoofRow->id_project);

            // --- 6. cross-project isolation ---
            $otherList = $this->getJson("/api/projects/uuid/{$other->uuid_project}/progress");
            $otherList->assertStatus(200);
            foreach ($otherList->json('data') as $rowItem) {
                $this->assertNotSame((int) $spoofId, (int) $rowItem['id']);
                $this->assertNotSame((int) $firstId, (int) $rowItem['id']);
            }
        }

        echo "\n[TEST] progress full flow OK (first={$firstId}, second={$secondId})\n";
    }

    public function test_progress_with_multiple_files()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;
        $senderId = auth()->id();

        $image = UploadedFile::fake()->create('foto progres.jpg', 10, 'image/jpeg');
        $pdf = UploadedFile::fake()->create('laporan.pdf', 20, 'application/pdf');
        $doc = UploadedFile::fake()->create(
            'rab.docx',
            15,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );

        $response = $this->postForm("/api/projects/uuid/{$uuid}/progress", [
            'progress' => 65,
            'deskripsi' => 'Implementasi dan pengujian fitur.',
            'files' => [$image, $pdf, $doc],
        ]);
        $response->assertStatus(201);
        $response->assertJsonPath('status', 'ok');
        $progressId = (int) $response->json('data.id');
        $this->track($progressId);

        $attachments = $response->json('data.files');
        $this->assertCount(3, $attachments);
        $fileIds = array_map(fn ($f) => (int) $f['id'], $attachments);

        // --- id_file is a valid JSON array of the tb_files ids ---
        $row = DB::table('tb_progress')->where('id', $progressId)->first();
        $this->assertNotNull($row);
        $this->assertNotNull($row->id_file);
        $decoded = json_decode($row->id_file, true);
        $this->assertIsArray($decoded, 'id_file must be valid JSON');
        $this->assertSame($fileIds, array_map('intval', $decoded));
        $this->assertLessThanOrEqual(100, strlen($row->id_file), 'id_file must fit varchar(100)');

        $baseUrl = rtrim((string) config('elmech.project_file_url.base_url', config('app.url')), '/');
        $prefix = trim((string) config('elmech.project_file_url.prefix', 'files'), '/');

        // --- each file has a tb_files row tied to THIS project ---
        foreach ($fileIds as $fileId) {
            $fileRow = DB::table('tb_files')->where('id', $fileId)->first();
            $this->assertNotNull($fileRow, "tb_files row {$fileId} missing");
            $this->assertSame((int) $project->id_project, (int) $fileRow->id_parent);
            $this->assertSame((int) $senderId, (int) $fileRow->sender);
            $this->assertNotNull($fileRow->datetime);

            // path = FULL URL "<base>/files/<nama acak>"
            $this->assertStringStartsWith($baseUrl . '/' . $prefix . '/', $fileRow->path);

            $storedName = basename((string) parse_url($fileRow->path, PHP_URL_PATH));
            // Nama fisik acak 32-hex + ekstensi tervalidasi, BUKAN nama asli.
            $this->assertMatchesRegularExpression('/^[0-9a-f]{32}\.(jpg|jpeg|png|webp|gif|pdf|doc|docx)$/', $storedName);
            $this->assertStringNotContainsString('foto', strtolower($storedName));
            $this->assertStringNotContainsString('laporan', strtolower($storedName));
            $this->assertStringNotContainsString('rab', strtolower($storedName));

            // File fisik benar-benar tersimpan di direktori yang diizinkan.
            $physicalPath = $this->directory . '/' . $storedName;
            $this->assertTrue(
                Storage::disk($this->disk)->exists($physicalPath),
                "physical file {$physicalPath} missing"
            );
            $this->trackFile((int) $fileId, $physicalPath);

            // URL /files/<nama> benar-benar melayani file (bukan sekadar string).
            $publicResponse = $this->get('/files/' . $storedName);
            $publicResponse->assertStatus(200);
            $this->assertSame(
                Storage::disk($this->disk)->get($physicalPath),
                $publicResponse->streamedContent(),
                'isi /files/<nama> harus sama dengan file fisik'
            );

            // Endpoint unduhan terautentikasi tetap berfungsi dari full URL.
            $this->get("/api/projects/uuid/{$uuid}/files/{$fileId}")->assertStatus(200);
        }

        // Payload URL ke frontend memakai full URL yang sama.
        foreach ($attachments as $att) {
            $this->assertStringStartsWith($baseUrl . '/' . $prefix . '/', $att['url']);
            $this->assertTrue($att['exists']);
        }

        // --- ext derived from MIME is reported for the UI ---
        $exts = array_map(fn ($f) => $f['extension'], $attachments);
        $this->assertContains('jpg', $exts);
        $this->assertContains('pdf', $exts);
        $this->assertContains('docx', $exts);

        // --- GET returns the same attachments (persisted) ---
        $list = $this->getJson("/api/projects/uuid/{$uuid}/progress");
        $list->assertStatus(200);
        $fetched = $this->findProgress($list->json('data'), $progressId);
        $this->assertNotNull($fetched);
        $this->assertCount(3, $fetched['files']);
        $this->assertSame(
            $fileIds,
            array_map(fn ($f) => (int) $f['id'], $fetched['files'])
        );

        echo "\n[TEST] progress multi-file OK (progress={$progressId}, files=" . implode(',', $fileIds) . ")\n";
    }

    public function test_progress_rejects_disallowed_extension()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        $beforeProgress = DB::table('tb_progress')->where('id_project', $project->id_project)->count();
        $beforeFiles = DB::table('tb_files')->where('id_parent', $project->id_project)->count();

        $bad = UploadedFile::fake()->create('malware.exe', 5, 'application/x-msdownload');
        $response = $this->postForm("/api/projects/uuid/{$uuid}/progress", [
            'progress' => 50,
            'deskripsi' => 'File tidak valid.',
            'files' => [$bad],
        ]);
        $response->assertStatus(422);

        $this->assertSame(
            $beforeProgress,
            DB::table('tb_progress')->where('id_project', $project->id_project)->count()
        );
        $this->assertSame(
            $beforeFiles,
            DB::table('tb_files')->where('id_parent', $project->id_project)->count()
        );

        echo "\n[TEST] disallowed attachment type 422 OK\n";
    }

    public function test_progress_rejects_oversize_attachment()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        // Backend max is 20480 KB; ask for 25000 KB.
        $big = UploadedFile::fake()->create('big.pdf', 25000, 'application/pdf');
        $response = $this->postForm("/api/projects/uuid/{$uuid}/progress", [
            'progress' => 50,
            'deskripsi' => 'File terlalu besar.',
            'files' => [$big],
        ]);
        $response->assertStatus(422);

        echo "\n[TEST] oversize attachment 422 OK\n";
    }

    public function test_progress_rejects_too_many_files()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;
        $maxFiles = (int) config('elmech.project_progress.max_files', 10);

        $beforeProgress = DB::table('tb_progress')->where('id_project', $project->id_project)->count();

        $files = [];
        for ($i = 0; $i <= $maxFiles; $i++) {
            $files[] = UploadedFile::fake()->create("lampiran-{$i}.pdf", 1, 'application/pdf');
        }

        $response = $this->postForm("/api/projects/uuid/{$uuid}/progress", [
            'progress' => 50,
            'deskripsi' => 'Terlalu banyak file.',
            'files' => $files,
        ]);
        $response->assertStatus(422);

        // Nothing persisted when validation fails (filesystem ops never started).
        $this->assertSame(
            $beforeProgress,
            DB::table('tb_progress')->where('id_project', $project->id_project)->count()
        );

        echo "\n[TEST] too many attachments 422 OK\n";
    }

    public function test_progress_file_isolation()
    {
        $project = $this->firstProject();
        $other = $this->otherProject();
        if (!$other) {
            $this->markTestSkipped('Need a second project to test isolation.');
        }

        // A tb_files row that belongs to ANOTHER project.
        $foreignFileId = DB::table('tb_files')->insertGetId([
            'id_parent' => $other->id_project,
            'sender' => auth()->id(),
            'datetime' => now(),
            'path' => $this->directory . '/foreign_' . uniqid() . '.txt',
        ]);
        $this->createdFileIds[] = $foreignFileId;
        // Deliberately NOT creating the physical file: it must not be returned.

        // Progress for project A references that foreign file id.
        $progressId = DB::table('tb_progress')->insertGetId([
            'id_project' => $project->id_project,
            'id_file' => json_encode([$foreignFileId]),
            'progress' => 42,
            'deskripsi' => 'Referensi file asing.',
            'created_at' => now(),
        ]);
        $this->track((int) $progressId);

        $list = $this->getJson("/api/projects/uuid/{$project->uuid_project}/progress");
        $list->assertStatus(200);
        $fetched = $this->findProgress($list->json('data'), (int) $progressId);
        $this->assertNotNull($fetched);
        // The foreign file must NOT appear as an attachment of project A.
        $this->assertSame([], $fetched['files']);

        echo "\n[TEST] progress file isolation OK\n";
    }

    public function test_legacy_relative_path_still_displayed()
    {
        $project = $this->firstProject();

        // Simulasi record lama: path relatif "project-files/<nama>".
        $legacyName = 'legacy_' . uniqid() . '.txt';
        $legacyRelative = $this->directory . '/' . $legacyName;
        Storage::disk($this->disk)->put($legacyRelative, 'legacy-content');
        $this->createdPaths[] = $legacyRelative;

        $fileId = DB::table('tb_files')->insertGetId([
            'id_parent' => $project->id_project,
            'sender' => auth()->id(),
            'datetime' => now(),
            'path' => $legacyRelative,
        ]);
        $this->createdFileIds[] = $fileId;

        $progressId = DB::table('tb_progress')->insertGetId([
            'id_project' => $project->id_project,
            'id_file' => json_encode([$fileId]),
            'progress' => 30,
            'deskripsi' => 'Lampiran format lama.',
            'created_at' => now(),
        ]);
        $this->track((int) $progressId);

        $list = $this->getJson("/api/projects/uuid/{$project->uuid_project}/progress");
        $list->assertStatus(200);
        $fetched = $this->findProgress($list->json('data'), (int) $progressId);
        $this->assertNotNull($fetched);
        $this->assertCount(1, $fetched['files']);
        $this->assertSame($legacyName, $fetched['files'][0]['name']);
        $this->assertTrue($fetched['files'][0]['exists']);
        $this->assertStringContainsString($legacyName, $fetched['files'][0]['url']);

        // Endpoint unggah/unduh tetap bekerja untuk path relatif lama.
        $this->get("/api/projects/uuid/{$project->uuid_project}/files/{$fileId}")->assertStatus(200);

        echo "\n[TEST] legacy relative path compatibility OK\n";
    }

    public function test_files_route_rejects_unknown_and_traversal()
    {
        $this->get('/files/does-not-exist-' . uniqid() . '.pdf')->assertStatus(404);

        // '..' cocok dengan pola route tetapi harus ditolak oleh controller.
        $this->get('/files/..')->assertStatus(404);

        echo "\n[TEST] /files route safety OK\n";
    }

    public function test_progress_validation_rules()
    {
        $project = $this->firstProject();
        $uuid = $project->uuid_project;

        $invalid = [
            ['progress' => 101, 'deskripsi' => 'terlalu besar'],
            ['progress' => -1, 'deskripsi' => 'negatif'],
            ['progress' => 'abc', 'deskripsi' => 'bukan angka'],
            ['progress' => 50, 'deskripsi' => ''],
            ['progress' => 50, 'deskripsi' => '   '],
            ['progress' => 50],
            ['deskripsi' => 'tanpa progress'],
        ];

        foreach ($invalid as $payload) {
            $response = $this->postForm("/api/projects/uuid/{$uuid}/progress", $payload);
            $response->assertStatus(422);
        }

        // Nothing was persisted by the rejected payloads.
        $this->assertSame(
            0,
            DB::table('tb_progress')->where('id_project', $project->id_project)->count()
        );

        echo "\n[TEST] progress validation 422 OK\n";
    }

    public function test_unknown_project_uuid_404()
    {
        $unknown = 'thisuuiddoesnotexist000000000';
        $this->getJson("/api/projects/uuid/{$unknown}/progress")->assertStatus(404);
        $this->postForm("/api/projects/uuid/{$unknown}/progress", [
            'progress' => 50,
            'deskripsi' => 'x',
        ])->assertStatus(404);

        echo "\n[TEST] unknown uuid 404 OK\n";
    }

    public function test_unauthenticated_cannot_access_progress()
    {
        auth()->logout();
        $project = $this->firstProject();

        $this->getJson("/api/projects/uuid/{$project->uuid_project}/progress")
            ->assertStatus(401);
        $this->postForm("/api/projects/uuid/{$project->uuid_project}/progress", [
            'progress' => 50,
            'deskripsi' => 'x',
        ])->assertStatus(401);

        echo "\n[TEST] unauthenticated 401 OK\n";
    }
}
