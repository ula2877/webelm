<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class QuotationSavePdfTest extends TestCase
{
    // No database refresh - we only INSERT into existing tables.
    protected $connectionsToTransact = [];

    private function loginUser()
    {
        $user = DB::table('tb_user')->first();
        $this->actingAs(\App\Models\User::find($user->id_user));
    }

    private function payload(string $nomor): array
    {
        return [
            'nomor' => $nomor,
            'tanggal' => '2026-10-05',
            'city' => 'Surabaya',
            'attachment' => '1 (Satu) Berkas',
            'subject' => 'Surat Penawaran Harga Aplikasi Keuangan (TEST)',
            'customerName' => 'PSDKP BENOA',
            'customerAddress' => "Jalan Raya Pelabuhan Umum Benoa,\nDenpasar Selatan, Bali",
            'systemName' => 'sistem manajemen keuangan',
            'usePPN' => true,
            'ppnRate' => 11,
            'useDP' => true,
            'dpRate' => 30,
            'notes' => ['Durasi penyelesaian 3 Bulan.', 'Sudah Termasuk Jasa Instalasi Cloud Server'],
            'items' => [
                ['nama_komponen' => 'Jasa Analisis dan Perancangan', 'spesifikasi' => "Analisis kebutuhan\nPenyusunan dokumen SRS", 'volume' => 1, 'satuan' => 'Paket', 'harga_satuan' => 6500000],
                ['nama_komponen' => 'Pengembangan Backend', 'spesifikasi' => 'Setup project backend', 'volume' => 2, 'satuan' => 'Paket', 'harga_satuan' => 7500000],
            ],
            'useSignature' => true,
            'useStamp' => true,
            'signature_asset_id' => 4,
            'stamp_asset_id' => 5,
            'signaturePosition' => ['x' => 13, 'y' => -42, 'zoom' => 1.58],
            'stampPosition' => ['x' => -7, 'y' => -42, 'zoom' => 1.55],
            'signature' => ['companyName' => 'CV. Elmech Technology Indonesia', 'signerName' => 'Muhammad Taufiq Rahman', 'signerTitle' => 'Direktur'],
        ];
    }

    public function test_save_quotation()
    {
        $this->loginUser();

        $response = $this->postJson('/api/surat/quotation', $this->payload('PNR/E2E1718511/ELMECH/2026'));
        $response->assertStatus(201);
        $body = $response->json();
        $this->assertSame('ok', $body['status']);
        $this->assertNotEmpty($body['data']['id']);
        $this->assertNotEmpty($body['data']['uuid']);

        $id = $body['data']['id'];
        $row = DB::table('tb_surat')->where('id_surat', $id)->first();
        $this->assertSame('quotation', $row->jenis);
        $this->assertSame('PNR/E2E1718511/ELMECH/2026', $row->nomor);
        // total = (6.5M + 2*7.5M) * 1.11 = 23.865.000
        $this->assertSame(23865000, (int) $row->total);
        $this->assertSame(4, (int) $row->id_asset_ttd);
        $this->assertSame(5, (int) $row->id_asset_stempel);
        $this->assertSame(1, (int) $row->use_signature_stamp);
        $this->assertNotNull($row->posisi_ttd);
        $this->assertNotNull($row->posisi_stempel);
        $this->assertSame(2, DB::table('tb_surat_item')->where('id_surat', $id)->count());

        echo "\n[TEST] save OK id={$id} uuid={$row->uuid_surat}\n";
    }

    public function test_save_validation_error()
    {
        $this->loginUser();

        $payload = $this->payload('PNR/E2E1718512/ELMECH/2026');
        $payload['nomor'] = '';
        $payload['items'] = [];
        $response = $this->postJson('/api/surat/quotation', $payload);
        $response->assertStatus(422);
        $body = $response->json();
        $this->assertNotEmpty($body['message']);
        $this->assertArrayHasKey('nomor', $body['errors']);
        $this->assertArrayHasKey('items', $body['errors']);
        echo "\n[TEST] validation 422 OK\n";
    }

    public function test_save_duplicate_nomor()
    {
        $this->loginUser();

        $this->postJson('/api/surat/quotation', $this->payload('PNR/E2E1718513/ELMECH/2026'))->assertStatus(201);
        $response = $this->postJson('/api/surat/quotation', $this->payload('PNR/E2E1718513/ELMECH/2026'));
        $response->assertStatus(422);
        echo "\n[TEST] duplicate nomor 422 OK\n";
    }

    public function test_pdf_download()
    {
        $this->loginUser();

        $response = $this->postJson('/api/surat/quotation', $this->payload('PNR/E2E1718514/ELMECH/2026'));
        $id = $response->json()['data']['id'];

        $pdf = $this->get("/api/surat/{$id}/pdf");
        $pdf->assertStatus(200);
        $this->assertSame('application/pdf', $pdf->headers->get('content-type'));
        $content = $pdf->streamedContent() ?? $pdf->getContent();
        $this->assertStringStartsWith('%PDF', $content);
        $this->assertGreaterThan(10000, strlen($content));
        echo "\n[TEST] pdf OK bytes=" . strlen($content) . "\n";
    }

    public function test_save_ppn_off_dp_off()
    {
        $this->loginUser();

        $payload = $this->payload('PNR/E2E1718516/ELMECH/2026');
        $payload['usePPN'] = false;
        $payload['useDP'] = false;
        $response = $this->postJson('/api/surat/quotation', $payload);
        $response->assertStatus(201);

        $row = DB::table('tb_surat')->where('id_surat', $response->json()['data']['id'])->first();
        // total = 6.5M + 2*7.5M = 21.5M, no PPN, no DP
        $this->assertSame(21500000, (int) $row->total);
        $data = json_decode($row->data, true);
        $this->assertFalse($data['usePPN']);
        $this->assertFalse($data['useDP']);
        $this->assertSame(0, $data['totals']['ppn']);
        $this->assertSame(21500000, $data['totals']['grandTotal']);
        echo "\n[TEST] PPN OFF + DP OFF OK\n";
    }

    public function test_save_ppn_on_dp_off()
    {
        $this->loginUser();

        $payload = $this->payload('PNR/E2E1718517/ELMECH/2026');
        $payload['usePPN'] = true;
        $payload['ppnRate'] = 11;
        $payload['useDP'] = false;
        $response = $this->postJson('/api/surat/quotation', $payload);
        $response->assertStatus(201);

        $row = DB::table('tb_surat')->where('id_surat', $response->json()['data']['id'])->first();
        // 21.5M * 1.11 = 23.865.000
        $this->assertSame(23865000, (int) $row->total);
        echo "\n[TEST] PPN ON 11% + DP OFF OK\n";
    }

    public function test_pdf_not_found()
    {
        $this->loginUser();
        $this->get('/api/surat/999999/pdf')->assertStatus(404);
        echo "\n[TEST] pdf 404 OK\n";
    }

    public function test_unauthenticated()
    {
        $this->postJson('/api/surat/quotation', $this->payload('PNR/E2E1718515/ELMECH/2026'))->assertStatus(401);
        echo "\n[TEST] unauthenticated 401 OK\n";
    }
}
