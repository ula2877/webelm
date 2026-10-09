<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Guards the detail payload for the View Projek "Owner / Customer & Tim
 * Project" card.
 *
 * The card needs the customer's `alamat` and `no_hp` from tb_user, while the
 * worker list must expose identity only (id + nama) - no address/phone. These
 * tests pin that contract. Read-only: no rows are created or modified.
 */
class ProjectClientDetailTest extends TestCase
{
    protected $connectionsToTransact = [];

    protected function setUp(): void
    {
        parent::setUp();

        $user = DB::table('tb_user')->first();
        $this->actingAs(\App\Models\User::find($user->id_user));
    }

    public function test_detail_exposes_client_address_and_phone()
    {
        $row = DB::table('tb_project as p')
            ->join('tb_user as u', 'u.id_user', '=', 'p.id_client')
            ->whereNotNull('p.uuid_project')
            ->select('p.uuid_project', 'p.id_client', 'u.nama', 'u.alamat', 'u.no_hp')
            ->first();

        $this->assertNotNull($row, 'Need at least one project with a client.');

        $res = $this->getJson("/api/projects/uuid/{$row->uuid_project}");
        $res->assertStatus(200);
        $res->assertJsonPath('status', 'ok');

        $client = $res->json('data.client');
        $this->assertIsArray($client, 'client must be an object/array.');
        $this->assertSame($row->nama, $client['nama']);

        // Keys must always exist (null is allowed) so the UI never crashes.
        $this->assertArrayHasKey('alamat', $client);
        $this->assertArrayHasKey('no_hp', $client);

        // Real DB values - never fabricated.
        $this->assertSame($row->alamat, $client['alamat']);
        $this->assertSame($row->no_hp, $client['no_hp']);

        echo "\n[TEST] client alamat/no_hp OK (id_client={$row->id_client})\n";
    }

    public function test_worker_payload_is_identity_only()
    {
        $row = DB::table('tb_project as p')
            ->join('tb_tim as t', 't.id_project', '=', 'p.id_project')
            ->join('tb_user as u', 'u.id_user', '=', 't.id_worker')
            ->whereNotNull('p.uuid_project')
            ->select('p.uuid_project', 't.id_worker', 'u.nama')
            ->first();

        if (!$row) {
            $this->markTestSkipped('No project team rows to verify.');
        }

        $res = $this->getJson("/api/projects/uuid/{$row->uuid_project}");
        $res->assertStatus(200);

        $workers = $res->json('data.workers');
        $this->assertIsArray($workers);
        $this->assertNotEmpty($workers);

        $match = null;
        foreach ($workers as $worker) {
            if ((int) ($worker['id'] ?? 0) === (int) $row->id_worker) {
                $match = $worker;
                break;
            }
        }

        $this->assertNotNull($match, 'Worker should be present in the payload.');
        $this->assertSame($row->nama, $match['nama']);

        // The UI shows name only; the payload must not leak contact fields.
        $this->assertArrayNotHasKey('alamat', $match);
        $this->assertArrayNotHasKey('no_hp', $match);

        echo "\n[TEST] worker identity-only OK (id_worker={$row->id_worker})\n";
    }
}
