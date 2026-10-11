<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProjectAccessTest extends TestCase
{
    protected $connectionsToTransact = [];

    private int $adminId;
    private int $workerId;
    private int $clientId;

    /** @var int[] */
    private array $tempProjectIds = [];
    /** @var int[] */
    private array $tempProgressIds = [];
    /** @var int[] */
    private array $tempFileIds = [];
    /** @var string[] */
    private array $tempPaths = [];

    protected function setUp(): void
    {
        parent::setUp();

        // Find test users
        $this->adminId = $this->findUserByLevel([1]);
        $this->workerId = $this->findUserByLevel([2, 10]);
        $this->clientId = $this->findUserByLevel([3]);

        $this->disk = config('elmech.project_file.disk', 'public');
        $this->directory = trim(config('elmech.project_file.directory', 'project-files'), '/');
    }

    protected function tearDown(): void
    {
        // Clean up created files
        foreach ($this->tempPaths as $path) {
            try {
                Storage::disk($this->disk)->delete($path);
            } catch (\Throwable $e) {
                // ignore
            }
        }

        // Clean up DB
        if (!empty($this->tempFileIds)) {
            DB::table('tb_files')->whereIn('id', $this->tempFileIds)->delete();
        }
        if (!empty($this->tempProgressIds)) {
            DB::table('tb_progress')->whereIn('id', $this->tempProgressIds)->delete();
        }
        if (!empty($this->tempProjectIds)) {
            DB::table('tb_project')->whereIn('id_project', $this->tempProjectIds)->delete();
        }

        parent::tearDown();
    }

    private function findUserByLevel(array $levels): int
    {
        $user = DB::table('tb_user')
            ->whereIn('id_level', $levels)
            ->orderBy('id_user')
            ->first();

        $this->assertNotNull($user, 'Butuh minimal satu user dengan level ' . implode(',', $levels));

        return (int) $user->id_user;
    }

    private function asUser(int $id): self
    {
        $user = User::find($id);
        if ($user) {
            $this->actingAs($user);
        }

        return $this;
    }

    private function createTempProject(?int $workerId = null): array
    {
        $uuid = 'TEST' . substr(bin2hex(random_bytes(12)), 0, 20);
        $client = DB::table('tb_user')->where('id_level', 3)->first() ?? DB::table('tb_user')->first();

        $id = DB::table('tb_project')->insertGetId([
            'uuid_project' => $uuid,
            'id_client' => $client->id_user,
            'judul' => 'Test Projek RBAC',
            'jenis' => 'project',
            'deskripsi' => 'test',
            'tanggal_mulai' => '2026-10-01',
            'tanggal_estimasi' => '2026-10-15',
            'tanggal_selesai' => '2026-10-15',
            'status' => 'running',
            'urgency' => 'normal',
            'harga' => 1000000,
            'is_proposed' => 0,
        ]);

        $this->tempProjectIds[] = $id;

        if ($workerId) {
            DB::table('tb_tim')->insert([
                'id_project' => $id,
                'id_worker' => $workerId,
            ]);
        }

        return [
            'id' => $id,
            'uuid' => $uuid,
        ];
    }

    public function test_admin_sees_all_projects_and_can_crud()
    {
        $this->asUser($this->adminId);

        // Can see projects
        $res = $this->getJson('/api/projects');
        $res->assertStatus(200);
        $this->assertSame('ok', $res->json('status'));

        // Can create
        $client = DB::table('tb_user')->where('id_level', 3)->first();
        $create = $this->postJson('/api/projects', [
            'id_client' => $client->id_user,
            'judul' => 'Test Create Admin',
            'tanggal_mulai' => '2026-10-01',
            'tanggal_estimasi' => '2026-10-10',
            'status' => 'running',
            'urgency' => 'normal',
            'harga' => 500000,
            'worker_ids' => [],
        ]);
        $create->assertStatus(201);
        $proj = $create->json('data');
        $this->tempProjectIds[] = $proj['id'];

        // Can update
        $update = $this->putJson('/api/projects/uuid/' . $proj['uuid'], [
            'id_client' => $client->id_user,
            'judul' => 'Test Update Admin',
            'tanggal_mulai' => '2026-10-01',
            'tanggal_estimasi' => '2026-10-11',
            'status' => 'running',
            'urgency' => 'normal',
            'harga' => 600000,
            'worker_ids' => [],
        ]);
        $update->assertStatus(200);

        // Can delete
        $del = $this->deleteJson('/api/projects/' . $proj['id']);
        $del->assertStatus(200);
        // Remove from temp to avoid double delete
        $this->tempProjectIds = array_filter($this->tempProjectIds, fn ($x) => $x != $proj['id']);
    }

    public function test_worker_only_sees_assigned_projects()
    {
        $this->asUser($this->workerId);

        $res = $this->getJson('/api/projects');
        $res->assertStatus(200);
        $this->assertSame('ok', $res->json('status'));

        // All returned projects must be assigned to this worker
        $assignedIds = DB::table('tb_tim')
            ->where('id_worker', $this->workerId)
            ->pluck('id_project')
            ->toArray();

        foreach ($res->json('data') as $p) {
            $this->assertContains($p['id'], $assignedIds);
        }
    }

    public function test_worker_has_no_create_edit_delete_buttons_and_no_api_access()
    {
        $this->asUser($this->workerId);

        // Cannot create via API
        $client = DB::table('tb_user')->where('id_level', 3)->first();
        $this->postJson('/api/projects', [
            'id_client' => $client->id_user,
            'judul' => 'Nope',
            'tanggal_mulai' => '2026-10-01',
            'tanggal_estimasi' => '2026-10-01',
            'status' => 'running',
            'urgency' => 'normal',
            'harga' => 1000,
        ])->assertStatus(403);

        // Cannot edit
        $this->putJson('/api/projects/uuid/does-not-exist', [
            'id_client' => $client->id_user,
            'judul' => 'Nope',
            'tanggal_mulai' => '2026-10-01',
            'tanggal_estimasi' => '2026-10-01',
            'status' => 'running',
            'urgency' => 'normal',
            'harga' => 1000,
        ])->assertStatus(403);

        // Cannot delete
        $this->deleteJson('/api/projects/1')->assertStatus(403);
    }

    public function test_worker_can_view_assigned_project_detail_but_not_unassigned()
    {
        $projAssigned = $this->createTempProject($this->workerId);
        $projUnassigned = $this->createTempProject(); // no worker assigned

        $this->asUser($this->workerId);

        // Assigned: ok
        $this->getJson('/api/projects/uuid/' . $projAssigned['uuid'])
            ->assertStatus(200)
            ->assertJsonPath('status', 'ok');

        // Unassigned: 404 (or 403 if preferred; we use 404)
        $this->getJson('/api/projects/uuid/' . $projUnassigned['uuid'])
            ->assertStatus(404);
    }

    public function test_worker_cannot_access_other_workers_project_detail()
    {
        // Create project assigned to someone else
        $otherWorker = $this->findUserByLevel([2, 10]);
        while ($otherWorker == $this->workerId) {
            $otherWorker = $this->findUserByLevel([2, 10]);
        }

        $projOther = $this->createTempProject($otherWorker);

        $this->asUser($this->workerId);
        $this->getJson('/api/projects/uuid/' . $projOther['uuid'])
            ->assertStatus(404);
    }

    public function test_worker_cannot_create_edit_delete_via_api()
    {
        $proj = $this->createTempProject($this->workerId);
        $client = DB::table('tb_user')->where('id_level', 3)->first();

        $this->asUser($this->workerId);

        $this->postJson('/api/projects', [
            'id_client' => $client->id_user,
            'judul' => 'X',
            'tanggal_mulai' => '2026-10-01',
            'tanggal_estimasi' => '2026-10-01',
            'status' => 'running',
            'urgency' => 'normal',
            'harga' => 1,
        ])->assertStatus(403);

        $this->putJson('/api/projects/uuid/' . $proj['uuid'], [
            'id_client' => $client->id_user,
            'judul' => 'Y',
            'tanggal_mulai' => '2026-10-01',
            'tanggal_estimasi' => '2026-10-01',
            'status' => 'running',
            'urgency' => 'normal',
            'harga' => 1,
            'worker_ids' => [$this->workerId],
        ])->assertStatus(403);

        $this->deleteJson('/api/projects/' . $proj['id'])->assertStatus(403);
    }

    public function test_worker_can_add_progress_and_upload_multiple_files()
    {
        $proj = $this->createTempProject($this->workerId);
        $this->asUser($this->workerId);

        $image = UploadedFile::fake()->create('foto.jpg', 10, 'image/jpeg');
        $pdf = UploadedFile::fake()->create('laporan.pdf', 20, 'application/pdf');

        $res = $this->post('/api/projects/uuid/' . $proj['uuid'] . '/progress', [
            'progress' => 75,
            'deskripsi' => 'Progres test worker',
            'files' => [$image, $pdf],
        ], ['Accept' => 'application/json']);

        $res->assertStatus(201);
        $res->assertJsonPath('status', 'ok');
        $progressId = (int) $res->json('data.id');
        $this->tempProgressIds[] = $progressId;

        $attachments = $res->json('data.files');
        $this->assertCount(2, $attachments);
        foreach ($attachments as $f) {
            $this->tempFileIds[] = $f['id'];
            // record path
            $storedName = basename((string) parse_url($f['url'] ?? '', PHP_URL_PATH) ?: '');
            if ($storedName) {
                $this->tempPaths[] = $this->directory . '/' . $storedName;
            }
        }
    }

    public function test_worker_can_delete_progress_and_files()
    {
        $proj = $this->createTempProject($this->workerId);
        $this->asUser($this->workerId);

        // Create progress with files
        $image = UploadedFile::fake()->create('foto2.jpg', 10, 'image/jpeg');
        $res = $this->post('/api/projects/uuid/' . $proj['uuid'] . '/progress', [
            'progress' => 50,
            'deskripsi' => 'Progres hapus test',
            'files' => [$image],
        ], ['Accept' => 'application/json']);
        $res->assertStatus(201);
        $progressId = (int) $res->json('data.id');
        $files = $res->json('data.files');
        $this->assertCount(1, $files);
        $fileId = $files[0]['id'];
        $storedName = basename((string) parse_url($files[0]['url'] ?? '', PHP_URL_PATH) ?: '');
        if ($storedName) {
            $this->tempPaths[] = $this->directory . '/' . $storedName;
        }

        // Delete
        $del = $this->deleteJson('/api/projects/uuid/' . $proj['uuid'] . '/progress/' . $progressId);
        $del->assertStatus(200);

        // Progress gone
        $this->assertNull(DB::table('tb_progress')->where('id', $progressId)->first());
        // File deleted (owned)
        $this->assertNull(DB::table('tb_files')->where('id', $fileId)->first());
    }

    public function test_worker_cannot_access_pembayaran_or_file_manager()
    {
        $proj = $this->createTempProject($this->workerId);
        $this->asUser($this->workerId);

        // Pembayaran endpoints - admin only
        $this->getJson('/api/projects/uuid/' . $proj['uuid'] . '/pembayaran')->assertStatus(403);
        $this->postJson('/api/projects/uuid/' . $proj['uuid'] . '/pembayaran', [
            'pelunasan' => 'dp',
            'nominal' => 100000,
        ])->assertStatus(403);
        $this->deleteJson('/api/projects/uuid/' . $proj['uuid'] . '/pembayaran/1')->assertStatus(403);

        // File manager endpoints - admin only
        $this->getJson('/api/projects/uuid/' . $proj['uuid'] . '/files')->assertStatus(403);
        $this->post('/api/projects/uuid/' . $proj['uuid'] . '/files', [], ['Accept' => 'application/json'])->assertStatus(403);
        $this->deleteJson('/api/projects/uuid/' . $proj['uuid'] . '/files/1')->assertStatus(403);
    }

    public function test_dashboards_and_other_pages_still_function()
    {
        // Admin
        $this->asUser($this->adminId);
        $this->getJson('/api/dashboard')->assertStatus(200)->assertJsonPath('data.scope', 'admin');
        $this->getJson('/api/me')->assertStatus(200);

        // Worker
        $this->asUser($this->workerId);
        $dash = $this->getJson('/api/dashboard')->assertStatus(200);
        $this->assertSame('worker', $dash->json('data.scope'));
        $this->getJson('/api/me')->assertStatus(200);
        $this->getJson('/api/projects')->assertStatus(200);
    }
}
