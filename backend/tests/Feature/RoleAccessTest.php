<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Pembatasan akses berbasis role.
 *
 * Admin (tb_level.id_level = 1) boleh mengakses User Management & Surat,
 * sedangkan worker (2, 10) dan role non-admin lain (mis. client = 3) harus
 * ditolak dengan HTTP 403 oleh middleware 'admin' - bukan sekadar disembunyikan
 * di frontend. Request tanpa sesi login tetap 401.
 *
 * Test ini TIDAK mengubah schema; ia hanya membaca user yang sudah ada dan
 * (di satu test) membuat lalu menghapus satu user sementara untuk membuktikan
 * CRUD admin masih berjalan.
 */
class RoleAccessTest extends TestCase
{
    protected $connectionsToTransact = [];

    private int $adminId;
    private int $workerId;
    private int $clientId;

    /** @var int[] user sementara yang harus dibersihkan. */
    private array $tempUserIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->adminId = $this->idForLevel(1, 'admin');
        $this->workerId = $this->idForLevel(2, 'worker');
        $this->clientId = $this->idForLevel(3, 'client');
    }

    protected function tearDown(): void
    {
        if (!empty($this->tempUserIds)) {
            DB::table('tb_user')->whereIn('id_user', $this->tempUserIds)->delete();
        }

        parent::tearDown();
    }

    private function idForLevel(int $level, string $label): int
    {
        $id = DB::table('tb_user')
            ->where('id_level', $level)
            ->orderBy('id_user')
            ->value('id_user');

        $this->assertNotNull($id, "Butuh minimal satu user level {$label} di tb_user.");

        return (int) $id;
    }

    private function asUser(int $id): self
    {
        $this->actingAs(User::find($id));

        return $this;
    }

    /** Daftar endpoint admin: [method, uri]. */
    private function adminEndpoints(): array
    {
        return [
            ['GET', '/api/users'],
            ['POST', '/api/users'],
            ['GET', '/api/users/1'],
            ['GET', '/api/users/1/dependents'],
            ['PUT', '/api/users/1'],
            ['DELETE', '/api/users/1'],
            ['GET', '/api/users/1/worker-files'],
            ['POST', '/api/users/1/worker-files'],
            ['DELETE', '/api/worker-files/1'],
            ['GET', '/api/surat'],
            ['GET', '/api/surat/quotation/next-number'],
            ['GET', '/api/surat/1'],
            ['POST', '/api/surat/quotation'],
            ['POST', '/api/surat/quotation/pdf-from-html'],
            ['GET', '/api/surat/1/pdf'],
            ['GET', '/api/surat/1/detail'],
            ['DELETE', '/api/surat/1'],
            ['PUT', '/api/surat/1/quotation'],
            ['GET', '/api/surat/invoice/next-number'],
            ['POST', '/api/surat/invoice'],
            ['PUT', '/api/surat/1/invoice'],
            ['GET', '/api/surat/delivery-note/next-number'],
            ['POST', '/api/surat/delivery-note'],
            ['PUT', '/api/surat/1/delivery-note'],
            ['GET', '/api/surat-assets'],
            ['POST', '/api/surat-assets'],
        ];
    }

    public function test_worker_is_forbidden_on_every_admin_endpoint()
    {
        $this->asUser($this->workerId);

        foreach ($this->adminEndpoints() as [$method, $uri]) {
            $response = $this->json($method, $uri);
            $this->assertSame(
                403,
                $response->getStatusCode(),
                "Worker seharusnya 403 pada {$method} {$uri}, dapat {$response->getStatusCode()}."
            );
        }

        echo "\n[TEST] worker ditolak 403 di semua endpoint admin OK\n";
    }

    public function test_non_admin_staff_is_forbidden_too()
    {
        // Kebijakan: hanya level 1 (admin) yang boleh; client pun ditolak.
        $this->asUser($this->clientId);

        $this->getJson('/api/users')->assertStatus(403);
        $this->getJson('/api/surat')->assertStatus(403);

        echo "\n[TEST] role non-admin (client) juga 403 OK\n";
    }

    public function test_guest_is_unauthenticated_on_admin_endpoints()
    {
        $this->getJson('/api/users')->assertStatus(401);
        $this->getJson('/api/surat')->assertStatus(401);
        $this->getJson('/api/user-options')->assertStatus(401);

        echo "\n[TEST] belum login -> 401 (mekanisme auth tetap) OK\n";
    }

    public function test_worker_can_still_use_its_own_endpoints()
    {
        $this->asUser($this->workerId);

        $this->getJson('/api/me')->assertStatus(200);
        $this->getJson('/api/projects')->assertStatus(200);

        $dashboard = $this->getJson('/api/dashboard')->assertStatus(200);
        $this->assertSame('worker', $dashboard->json('data.scope'));

        // Endpoint opsi user untuk form Projek tetap bisa diakses worker...
        $options = $this->getJson('/api/user-options')->assertStatus(200);
        $this->assertSame('ok', $options->json('status'));
        $this->assertIsArray($options->json('data'));
        $this->assertIsArray($options->json('roles'));

        // ...tetapi hanya membawa kolom aman (tanpa no_hp/alamat dsb).
        if (!empty($options->json('data'))) {
            $first = $options->json('data.0');
            $this->assertArrayHasKey('id', $first);
            $this->assertArrayHasKey('nama', $first);
            $this->assertArrayHasKey('role', $first);
            $this->assertArrayNotHasKey('no_hp', $first);
            $this->assertArrayNotHasKey('alamat', $first);
            $this->assertArrayNotHasKey('tanggal_gabung', $first);
        }

        echo "\n[TEST] worker tetap bisa akses dashboard/projects/user-options OK\n";
    }

    public function test_admin_can_access_user_management_and_surat()
    {
        $this->asUser($this->adminId);

        $users = $this->getJson('/api/users')->assertStatus(200);
        $this->assertSame('ok', $users->json('status'));
        $this->assertIsArray($users->json('roles'));

        $this->getJson('/api/users/' . $this->adminId)->assertStatus(200);
        $this->getJson('/api/users/' . $this->adminId . '/dependents')->assertStatus(200);

        $this->getJson('/api/surat')->assertStatus(200);
        $this->getJson('/api/surat-assets')->assertStatus(200);
        $this->getJson('/api/surat/quotation/next-number?tanggal=2026-01-01')->assertStatus(200);

        echo "\n[TEST] admin bisa akses User Management & Surat OK\n";
    }

    public function test_admin_can_still_create_and_delete_user()
    {
        $this->asUser($this->adminId);

        $username = 'racct_' . substr(bin2hex(random_bytes(8)), 0, 10);

        $created = $this->postJson('/api/users', [
            'username' => $username,
            'nama' => 'Role Access Test',
            'id_level' => 3,
            'no_hp' => '0800000000',
            'alamat' => 'Test Address',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ]);

        $created->assertStatus(201);

        $newId = (int) $created->json('data.id');
        $this->tempUserIds[] = $newId;

        $this->getJson('/api/users/' . $newId)->assertStatus(200);

        $this->deleteJson('/api/users/' . $newId)->assertStatus(200);

        // Sudah terhapus -> tidak ada sisa data uji.
        $this->assertNull(DB::table('tb_user')->where('id_user', $newId)->first());

        echo "\n[TEST] admin CRUD user (create + delete) tetap berfungsi OK\n";
    }

    public function test_worker_cannot_write_project_through_admin_denied_user_route()
    {
        // Negatif tambahan: memastikan 403 muncul SEBELUM validasi body
        // (middleware jalan lebih dulu), jadi body kosong pun tetap 403.
        $this->asUser($this->workerId);

        $this->postJson('/api/users', [])->assertStatus(403);
        $this->postJson('/api/surat/quotation', [])->assertStatus(403);

        echo "\n[TEST] 403 terjadi sebelum validasi body OK\n";
    }
}
