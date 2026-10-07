<?php

namespace App\Http\Controllers;

use App\Services\QuotationPdfRenderer;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Surat endpoints.
 *
 * Operates strictly on the EXISTING `tb_surat` table. No migration,
 * no new table and no new column - the real schema was inspected
 * and is the only schema used.
 *
 * Available columns relevant for listing:
 *   id_surat          int(11)        PK, auto_increment
 *   uuid_surat        varchar(30)    NOT NULL, UNIQUE
 *   jenis             enum(...)      NOT NULL
 *   nomor             varchar(50)    NULL
 *   tanggal           date           NOT NULL
 *   created_by        int(11)        NULL
 *   total             bigint(20)     NULL
 *   data              longtext       NOT NULL (JSON)
 *   created_at        timestamp      NULL
 *   updated_at        timestamp      NULL
 *   deleted_at        timestamp      NULL (soft delete)
 */
class SuratController extends Controller
{
    /** Matches the frontend ITEMS_PER_PAGE default. */
    private const DEFAULT_PER_PAGE = 6;

    /** Valid jenis values from the enum. */
    private const VALID_JENIS = [
        'quotation',
        'invoice',
        'delivery-note',
        'bast',
        'inspection-request',
        'payment-request',
        'kuitansi',
    ];

    /**
     * Nomor prefix untuk jenis surat generik (selain quotation/invoice).
     * Pola nomor: PREFIX/DDMM[urutan]/ELMECH/YYYY.
     */
    private const SURAT_JENIS_PREFIX = [
        'delivery-note' => 'SJ',
        'bast' => 'BAST',
        'inspection-request' => 'KTR',
        'payment-request' => 'KTR',
        'kuitansi' => 'KWT',
    ];

    /**
     * GET /api/surat
     * ?search=&jenis=&status=&page=&per_page=
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        $perPage = max(1, min(100, $perPage));

        $currentPage = (int) $request->query('page', 1);
        $currentPage = max(1, $currentPage);

        $query = DB::table('tb_surat');

        // Default: hanya surat yang belum di-soft-delete. Filter
        // status 'Dihapus' meng-override aturan ini secara eksplisit.
        if ($request->query('status') !== 'Dihapus') {
            $query->whereNull('deleted_at');
        }

        // Search hits nomor AND JSON data fields that are commonly searched.
        // We search nomor and a few known keys inside data JSON.
        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $like = '%' . $this->escapeLike($search) . '%';
            $query->where(function ($inner) use ($like) {
                $inner->where('nomor', 'like', $like)
                    ->orWhere('data', 'like', $like);
            });
        }

        $jenis = $request->query('jenis');
        if ($jenis !== null && $jenis !== '' && $jenis !== 'all') {
            if (!in_array($jenis, self::VALID_JENIS, true)) {
                throw ValidationException::withMessages([
                    'jenis' => ['Filter jenis tidak valid.'],
                ]);
            }
            $query->where('jenis', $jenis);
        }

        // Status filter - searches inside JSON data->status field, with fallback to deleted_at
        $status = $request->query('status');
        if ($status !== null && $status !== '' && $status !== 'all') {
            // Valid status values from the data
            $validStatus = ['Dibaca', 'Belum Dibaca', 'Aktif', 'Dihapus'];
            if (!in_array($status, $validStatus, true)) {
                throw ValidationException::withMessages([
                    'status' => ['Filter status tidak valid.'],
                ]);
            }
            // Filter logic matches present(): JSON status field OR deleted_at for Dihapus
            if ($status === 'Dihapus') {
                // Dihapus = has deleted_at OR JSON status = 'Dihapus'
                $query->where(function ($q) {
                    $q->whereNotNull('deleted_at')
                        ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = ?", ['Dihapus']);
                });
            } elseif ($status === 'Aktif') {
                // Aktif = no deleted_at AND JSON status is not Dihapus (or null)
                $query->whereNull('deleted_at')
                    ->where(function ($q) {
                        $q->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) IS NULL")
                            ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) NOT IN (?)", [['Dihapus']]);
                    });
            } else {
                // Dibaca, Belum Dibaca = JSON status field matches exactly
                $query->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = ?", [$status]);
            }
        }

        // Stable order so pagination never repeats or skips a row.
        $surat = $query->orderBy('tanggal', 'desc')
            ->orderBy('id_surat', 'desc')
            ->paginate($perPage, ['*'], 'page', $currentPage);

        return response()->json([
            'status' => 'ok',
            'data' => array_map(fn ($row) => $this->present($row), $surat->items()),
            'meta' => [
                'current_page' => $surat->currentPage(),
                'last_page' => $surat->lastPage(),
                'per_page' => $surat->perPage(),
                'total' => $surat->total(),
                'from' => $surat->firstItem(),
                'to' => $surat->lastItem(),
            ],
            // Jenis options come from the enum, with live count so the
            // filter dropdown can never drift from the database.
            'jenis_options' => $this->jenisOptions(),
            // Status options with live count
            'status_options' => $this->statusOptions(),
        ], 200);
    }

    /**
     * GET /api/surat/quotation/next-number?tanggal=YYYY-MM-DD
     *
     * Nomor surat berikutnya untuk surat penawaran (jenis='quotation')
     * pada tanggal tersebut. Hanya surat aktif (deleted_at NULL) yang
     * dihitung; jenis lain tidak ikut. Tidak memakai localStorage/counter
     * frontend.
     */
    public function nextQuotationNumber(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tanggal' => ['required', 'date'],
        ]);

        $next = $this->maxQuotationUrutanForTanggal($validated['tanggal']) + 1;

        return response()->json([
            'status' => 'ok',
            'data' => [
                'nomor' => $this->formatQuotationNomor($validated['tanggal'], $next),
                'tanggal' => $validated['tanggal'],
                'urutan' => $next,
            ],
        ], 200);
    }

    /**
     * GET /api/surat/{id}/detail
     *
     * Full quotation payload for EDIT mode: tb_surat columns, the `data`
     * JSON, and tb_surat_item rows.
     */
    public function detail(string $id): JsonResponse
    {
        $surat = DB::table('tb_surat')->where('id_surat', $id)->first();
        if (!$surat) {
            return $this->notFound();
        }

        $items = DB::table('tb_surat_item')
            ->where('id_surat', $id)
            ->orderBy('no_urut')
            ->get();

        $data = json_decode((string) $surat->data, true);
        if (!is_array($data)) {
            $data = [];
        }

        return response()->json([
            'status' => 'ok',
            'data' => [
                'id' => (int) $surat->id_surat,
                'uuid' => $surat->uuid_surat,
                'jenis' => $surat->jenis,
                'nomor' => $surat->nomor,
                'tanggal' => $surat->tanggal,
                'total' => (int) ($surat->total ?? 0),
                'data' => $data,
                'id_asset_ttd' => $surat->id_asset_ttd,
                'id_asset_stempel' => $surat->id_asset_stempel,
                'use_signature_stamp' => (bool) $surat->use_signature_stamp,
                'posisi_ttd' => json_decode((string) $surat->posisi_ttd, true),
                'posisi_stempel' => json_decode((string) $surat->posisi_stempel, true),
                'items' => $items->map(fn ($it) => [
                    'no_urut' => (int) $it->no_urut,
                    'nama_komponen' => $it->nama_komponen,
                    'spesifikasi' => json_decode((string) ($it->spesifikasi ?? ''), true) ?: [],
                    'volume' => (float) $it->volume,
                    'satuan' => $it->satuan,
                    'harga_satuan' => (float) $it->harga_satuan,
                ])->values(),
            ],
        ], 200);
    }

    /**
     * PUT /api/surat/{id}/quotation
     *
     * UPDATE tb_surat + rebuild tb_surat_item untuk record yang SAMA.
     * Tidak INSERT surat baru.
     */
    public function updateQuotation(Request $request, string $id): JsonResponse
    {
        $surat = DB::table('tb_surat')->where('id_surat', $id)->where('jenis', 'quotation')->first();
        if (!$surat) {
            return $this->notFound();
        }

        $validated = $request->validate([
            'nomor' => ['required', 'string', 'max:50'],
            'tanggal' => ['required', 'date'],
            'city' => ['nullable', 'string', 'max:100'],
            'attachment' => ['nullable', 'string', 'max:100'],
            'subject' => ['required', 'string', 'max:255'],
            'customerName' => ['required', 'string', 'max:255'],
            'customerAddress' => ['required', 'string'],
            'systemName' => ['required', 'string', 'max:255'],
            'usePPN' => ['sometimes', 'boolean'],
            'ppnRate' => ['required_if:usePPN,true', 'nullable', 'numeric', 'min:0', 'max:100'],
            'useDP' => ['sometimes', 'boolean'],
            'dpRate' => ['required_if:useDP,true', 'nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'array'],
            'notes.*' => ['string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.nama_komponen' => ['required', 'string', 'max:500'],
            'items.*.spesifikasi' => ['nullable'],
            'items.*.volume' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'items.*.satuan' => ['required', 'string', 'in:PCS,Paket,OH,LS'],
            'items.*.harga_satuan' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'useSignature' => ['sometimes', 'boolean'],
            'useStamp' => ['sometimes', 'boolean'],
            'signature_asset_id' => ['nullable', 'integer'],
            'stamp_asset_id' => ['nullable', 'integer'],
            'signaturePosition' => ['nullable', 'array'],
            'signaturePosition.x' => ['nullable', 'numeric'],
            'signaturePosition.y' => ['nullable', 'numeric'],
            'signaturePosition.zoom' => ['nullable', 'numeric', 'min:0.1', 'max:3'],
            'stampPosition' => ['nullable', 'array'],
            'stampPosition.x' => ['nullable', 'numeric'],
            'stampPosition.y' => ['nullable', 'numeric'],
            'stampPosition.zoom' => ['nullable', 'numeric', 'min:0.1', 'max:3'],
            'signature' => ['nullable', 'array'],
            'signature.companyName' => ['nullable', 'string', 'max:255'],
            'signature.signerName' => ['required', 'string', 'max:255'],
            'signature.signerTitle' => ['nullable', 'string', 'max:100'],
        ], [
            'nomor.required' => 'Nomor surat wajib diisi.',
            'tanggal.required' => 'Tanggal surat wajib diisi.',
            'subject.required' => 'Hal / judul surat wajib diisi.',
            'customerName.required' => 'Nama instansi/perusahaan wajib diisi.',
            'customerAddress.required' => 'Alamat penerima wajib diisi.',
            'systemName.required' => 'Nama/deskripsi sistem wajib diisi.',
            'items.required' => 'Minimal satu komponen penawaran harus ditambahkan.',
            'items.*.nama_komponen.required' => 'Nama komponen wajib diisi.',
            'items.*.volume.gt' => 'Volume harus lebih dari 0.',
            'items.*.satuan.in' => 'Satuan tidak valid. Pilihan: PCS, Paket, OH, LS.',
            'ppnRate.required_if' => 'Persentase PPN wajib diisi.',
            'dpRate.required_if' => 'Persentase DP wajib diisi.',
            'signature.signerName.required' => 'Nama penandatangan wajib diisi.',
        ]);

        // Nomor unik per jenis, kecuali record ini sendiri.
        $dupe = DB::table('tb_surat')
            ->where('jenis', 'quotation')
            ->where('nomor', $validated['nomor'])
            ->where('id_surat', '<>', $id)
            ->whereNull('deleted_at')
            ->exists();
        if ($dupe) {
            throw ValidationException::withMessages([
                'nomor' => ['Nomor surat sudah digunakan pada surat penawaran lain.'],
            ]);
        }

        $signatureAssetId = !empty($validated['signature_asset_id']) ? (int) $validated['signature_asset_id'] : null;
        $stampAssetId = !empty($validated['stamp_asset_id']) ? (int) $validated['stamp_asset_id'] : null;

        $signatureAsset = null;
        if ($signatureAssetId !== null) {
            $signatureAsset = DB::table('tb_surat_asset')
                ->where('id_asset', $signatureAssetId)
                ->where('jenis', 'signature')
                ->whereNull('deleted_at')
                ->first();
            if (!$signatureAsset) {
                throw ValidationException::withMessages(['signature_asset_id' => ['Asset tanda tangan tidak valid.']]);
            }
        }

        $stampAsset = null;
        if ($stampAssetId !== null) {
            $stampAsset = DB::table('tb_surat_asset')
                ->where('id_asset', $stampAssetId)
                ->where('jenis', 'stamp')
                ->whereNull('deleted_at')
                ->first();
            if (!$stampAsset) {
                throw ValidationException::withMessages(['stamp_asset_id' => ['Asset stempel tidak valid.']]);
            }
        }

        $itemRows = [];
        $total = 0;
        foreach ($validated['items'] as $index => $item) {
            $volume = (float) $item['volume'];
            $harga = (float) $item['harga_satuan'];
            $total += (int) round($volume * $harga);

            $specs = $item['spesifikasi'] ?? null;
            if (is_string($specs)) {
                $specs = array_values(array_filter(
                    array_map('trim', explode("\n", $specs)),
                    fn ($line) => $line !== ''
                ));
            }
            $specs = is_array($specs) ? array_values(array_map('strval', $specs)) : [];

            $itemRows[] = [
                'id_surat' => (int) $id,
                'no_urut' => $index + 1,
                'nama_komponen' => $item['nama_komponen'],
                'spesifikasi' => $specs === [] ? null : json_encode($specs),
                'volume' => $volume,
                'satuan' => $item['satuan'],
                'harga_satuan' => (int) round($harga),
                'data' => null,
            ];
        }

        $usePPN = !empty($validated['usePPN']);
        $ppnRate = $usePPN ? (float) $validated['ppnRate'] : 0;
        $ppn = (int) round($total * $ppnRate / 100);
        $grandTotal = $total + $ppn;

        $useDP = !empty($validated['useDP']);
        $dpRate = $useDP ? (float) $validated['dpRate'] : 0;
        $dp = (int) round($grandTotal * $dpRate / 100);

        $useSignature = !empty($validated['useSignature']);
        $useStamp = !empty($validated['useStamp']);

        $position = function (?array $pos): array {
            return [
                'x' => (float) ($pos['x'] ?? 0),
                'y' => (float) ($pos['y'] ?? 0),
                'zoom' => (float) ($pos['zoom'] ?? 1),
            ];
        };
        $posTtd = $useSignature ? $position(is_array($validated['signaturePosition'] ?? null) ? $validated['signaturePosition'] : null) : null;
        $posStempel = $useStamp ? $position(is_array($validated['stampPosition'] ?? null) ? $validated['stampPosition'] : null) : null;

        $signatureBlock = is_array($validated['signature'] ?? null) ? $validated['signature'] : [];

        $dataJson = [
            'city' => $validated['city'] ?? null,
            'attachment' => $validated['attachment'] ?? null,
            'subject' => $validated['subject'],
            'customerName' => $validated['customerName'],
            'customerAddress' => $validated['customerAddress'],
            'systemName' => $validated['systemName'],
            'usePPN' => $usePPN,
            'ppnRate' => $usePPN ? $ppnRate : 0,
            'useDP' => $useDP,
            'dpRate' => $useDP ? $dpRate : 0,
            'useSignatureStamp' => ($useSignature || $useStamp),
            'useSignature' => $useSignature,
            'useStamp' => $useStamp,
            'signatureImage' => $signatureAsset ? $signatureAsset->path : null,
            'stampImage' => $stampAsset ? $stampAsset->path : null,
            'signaturePosition' => $posTtd,
            'stampPosition' => $posStempel,
            'signature' => [
                'companyName' => (string) ($signatureBlock['companyName'] ?? ''),
                'signerName' => (string) ($signatureBlock['signerName'] ?? ''),
                'signerTitle' => (string) ($signatureBlock['signerTitle'] ?? ''),
            ],
            'notes' => array_values(array_filter(
                array_map('strval', $validated['notes'] ?? []),
                fn ($n) => trim($n) !== ''
            )),
            'totals' => [
                'total' => $total,
                'ppn' => $ppn,
                'ppnRate' => $usePPN ? $ppnRate : 0,
                'grandTotal' => $grandTotal,
                'dp' => $useDP ? $dp : 0,
                'dpRate' => $useDP ? $dpRate : 0,
            ],
        ];

        try {
            DB::transaction(function () use ($id, $validated, $grandTotal, $dataJson, $signatureAssetId, $stampAssetId, $useSignature, $useStamp, $posTtd, $posStempel, $itemRows) {
                DB::table('tb_surat')->where('id_surat', $id)->update([
                    'nomor' => $validated['nomor'],
                    'tanggal' => $validated['tanggal'],
                    'total' => $grandTotal,
                    'data' => json_encode($dataJson),
                    'updated_at' => now(),
                    'id_asset_ttd' => $signatureAssetId,
                    'id_asset_stempel' => $stampAssetId,
                    'use_signature_stamp' => ($useSignature || $useStamp) ? 1 : 0,
                    'posisi_ttd' => $posTtd !== null ? json_encode($posTtd) : null,
                    'posisi_stempel' => $posStempel !== null ? json_encode($posStempel) : null,
                ]);

                DB::table('tb_surat_item')->where('id_surat', $id)->delete();
                foreach ($itemRows as $itemRow) {
                    DB::table('tb_surat_item')->insert($itemRow);
                }
            });
        } catch (QueryException $e) {
            Log::error('Gagal mengupdate surat penawaran', ['error' => $e->getMessage(), 'id' => $id]);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan surat. Silakan coba lagi.',
            ], 500);
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Surat penawaran berhasil diperbarui.',
            'data' => [
                'id' => (int) $id,
                'nomor' => $validated['nomor'],
                'tanggal' => $validated['tanggal'],
                'total' => $grandTotal,
                'jumlah_item' => count($itemRows),
            ],
        ], 200);
    }

    /**
     * DELETE /api/surat/{id}
     *
     * HARD delete: row di tb_surat benar-benar dihapus (bukan soft delete).
     * tb_surat_item terkait dihapus dulu agar tidak ada foreign key
     * yang menggantung. Id_asset_ttd/id_asset_stempel hanya reference,
     * asset di tb_surat_asset TIDAK dihapus (bisa dipakai surat lain).
     */
    public function destroy(string $id): JsonResponse
    {
        $surat = DB::table('tb_surat')
            ->where('id_surat', $id)
            ->first();

        if (!$surat) {
            return response()->json([
                'status' => 'error',
                'message' => 'Surat tidak ditemukan.',
            ], 404);
        }

        try {
            DB::transaction(function () use ($id) {
                DB::table('tb_surat_item')->where('id_surat', $id)->delete();
                DB::table('tb_surat')->where('id_surat', $id)->delete();
            });
        } catch (QueryException $e) {
            Log::error('Gagal menghapus surat', ['error' => $e->getMessage(), 'id' => $id]);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menghapus surat. Silakan coba lagi.',
            ], 500);
        }

        return response()->json([
            'status' => 'ok',
            'message' => 'Surat berhasil dihapus secara permanen.',
        ], 200);
    }

    /**
     * GET /api/surat/invoice/next-number?tanggal=YYYY-MM-DD
     * Nomor invoice berikutnya (INV/DDMM[urutan]/ELMECH/YYYY).
     */
    public function nextInvoiceNumber(Request $request): JsonResponse
    {
        $validated = $request->validate(['tanggal' => ['required', 'date']]);
        $next = $this->maxUrutanForTanggal('invoice', 'INV', $validated['tanggal']) + 1;

        return response()->json([
            'status' => 'ok',
            'data' => [
                'nomor' => $this->formatSuratNomor('INV', $validated['tanggal'], $next),
                'tanggal' => $validated['tanggal'],
                'urutan' => $next,
            ],
        ], 200);
    }

    /**
     * POST /api/surat/invoice
     * Simpan invoice ke tb_surat (jenis='invoice') + tb_surat_item.
     */
    public function storeInvoice(Request $request): JsonResponse
    {
        return $this->saveInvoice($request, null);
    }

    /** PUT /api/surat/{id}/invoice - update invoice esisting (record sama). */
    public function updateInvoice(Request $request, string $id): JsonResponse
    {
        $surat = DB::table('tb_surat')->where('id_surat', $id)->where('jenis', 'invoice')->first();
        if (!$surat) {
            return $this->notFound();
        }

        return $this->saveInvoice($request, $surat);
    }

    /** Core simpan/update invoice - pola storeQuotation dengan jenis='invoice'. */
    private function saveInvoice(Request $request, ?object $existing): JsonResponse
    {
        $validated = $request->validate([
            'nomor' => ['required', 'string', 'max:50'],
            'tanggal' => ['required', 'date'],
            'city' => ['nullable', 'string', 'max:100'],
            'subject' => ['required', 'string', 'max:255'],
            'customerName' => ['required', 'string', 'max:255'],
            'customerAddress' => ['required', 'string'],
            'nomorPenawaran' => ['nullable', 'string', 'max:100'],
            'nomorPo' => ['nullable', 'string', 'max:100'],
            'usePPN' => ['sometimes', 'boolean'],
            'ppnRate' => ['required_if:usePPN,true', 'nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'array'],
            'notes.*' => ['string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.nama_komponen' => ['required', 'string', 'max:500'],
            'items.*.spesifikasi' => ['nullable'],
            'items.*.volume' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'items.*.satuan' => ['required', 'string', 'in:PCS,Paket,OH,LS'],
            'items.*.harga_satuan' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'bankName' => ['nullable', 'string', 'max:255'],
            'bankAccount' => ['nullable', 'string', 'max:100'],
            'bankOwner' => ['nullable', 'string', 'max:255'],
            'bankBranch' => ['nullable', 'string', 'max:255'],
            'useSignature' => ['sometimes', 'boolean'],
            'signature_asset_id' => ['nullable', 'integer'],
            'signaturePosition' => ['nullable', 'array'],
            'signaturePosition.x' => ['nullable', 'numeric'],
            'signaturePosition.y' => ['nullable', 'numeric'],
            'signaturePosition.zoom' => ['nullable', 'numeric', 'min:0.1', 'max:3'],
            'useStamp' => ['sometimes', 'boolean'],
            'stamp_asset_id' => ['nullable', 'integer'],
            'stampPosition' => ['nullable', 'array'],
            'stampPosition.x' => ['nullable', 'numeric'],
            'stampPosition.y' => ['nullable', 'numeric'],
            'stampPosition.zoom' => ['nullable', 'numeric', 'min:0.1', 'max:3'],
            'signature' => ['nullable', 'array'],
            'signature.companyName' => ['nullable', 'string', 'max:255'],
            'signature.signerName' => ['required', 'string', 'max:255'],
            'signature.signerTitle' => ['nullable', 'string', 'max:100'],
            'sumberQuotationId' => ['nullable', 'integer'],
        ], [
            'nomor.required' => 'Nomor invoice wajib diisi.',
            'tanggal.required' => 'Tanggal invoice wajib diisi.',
            'subject.required' => 'Perihal invoice wajib diisi.',
            'customerName.required' => 'Nama instansi/perusahaan wajib diisi.',
            'customerAddress.required' => 'Alamat penerima wajib diisi.',
            'items.required' => 'Minimal satu komponen harus ditambahkan.',
            'items.*.nama_komponen.required' => 'Nama komponen wajib diisi.',
            'items.*.volume.gt' => 'Volume harus lebih dari 0.',
            'items.*.satuan.in' => 'Satuan tidak valid. Pilihan: PCS, Paket, OH, LS.',
            'ppnRate.required_if' => 'Persentase PPN wajib diisi.',
            'signature.signerName.required' => 'Nama penandatangan wajib diisi.',
        ]);

        $dupeQuery = DB::table('tb_surat')
            ->where('jenis', 'invoice')
            ->where('nomor', $validated['nomor'])
            ->whereNull('deleted_at');
        if ($existing) {
            $dupeQuery->where('id_surat', '<>', $existing->id_surat);
        }
        if ($dupeQuery->exists()) {
            throw ValidationException::withMessages([
                'nomor' => ['Nomor invoice sudah digunakan pada invoice lain.'],
            ]);
        }

        $signatureAssetId = !empty($validated['signature_asset_id']) ? (int) $validated['signature_asset_id'] : null;
        $signatureAsset = null;
        if ($signatureAssetId !== null) {
            $signatureAsset = DB::table('tb_surat_asset')
                ->where('id_asset', $signatureAssetId)
                ->where('jenis', 'signature')
                ->whereNull('deleted_at')
                ->first();
            if (!$signatureAsset) {
                throw ValidationException::withMessages(['signature_asset_id' => ['Asset tanda tangan tidak valid.']]);
            }
        }

        $stampAssetId = !empty($validated['stamp_asset_id']) ? (int) $validated['stamp_asset_id'] : null;
        $stampAsset = null;
        if ($stampAssetId !== null) {
            $stampAsset = DB::table('tb_surat_asset')
                ->where('id_asset', $stampAssetId)
                ->where('jenis', 'stamp')
                ->whereNull('deleted_at')
                ->first();
            if (!$stampAsset) {
                throw ValidationException::withMessages(['stamp_asset_id' => ['Asset stempel tidak valid.']]);
            }
        }

        $itemRows = [];
        $total = 0;
        foreach ($validated['items'] as $index => $item) {
            $volume = (float) $item['volume'];
            $harga = (float) $item['harga_satuan'];
            $total += (int) round($volume * $harga);

            $specs = $item['spesifikasi'] ?? null;
            if (is_string($specs)) {
                $specs = array_values(array_filter(
                    array_map('trim', explode("\n", $specs)),
                    fn ($line) => $line !== ''
                ));
            }
            $specs = is_array($specs) ? array_values(array_map('strval', $specs)) : [];

            $itemRows[] = [
                'id_surat' => $existing ? (int) $existing->id_surat : 0,
                'no_urut' => $index + 1,
                'nama_komponen' => $item['nama_komponen'],
                'spesifikasi' => $specs === [] ? null : json_encode($specs),
                'volume' => $volume,
                'satuan' => $item['satuan'],
                'harga_satuan' => (int) round($harga),
                'data' => null,
            ];
        }

        $usePPN = !empty($validated['usePPN']);
        $ppnRate = $usePPN ? (float) $validated['ppnRate'] : 0;
        $ppn = (int) round($total * $ppnRate / 100);
        $grandTotal = $total + $ppn;

        $useSignature = !empty($validated['useSignature']);
        $useStamp = !empty($validated['useStamp']);

        $position = function (?array $pos): array {
            return [
                'x' => (float) ($pos['x'] ?? 0),
                'y' => (float) ($pos['y'] ?? 0),
                'zoom' => (float) ($pos['zoom'] ?? 1),
            ];
        };
        $posTtd = $useSignature ? $position(is_array($validated['signaturePosition'] ?? null) ? $validated['signaturePosition'] : null) : null;
        $posStempel = $useStamp ? $position(is_array($validated['stampPosition'] ?? null) ? $validated['stampPosition'] : null) : null;

        $signatureBlock = is_array($validated['signature'] ?? null) ? $validated['signature'] : [];

        $dataJson = [
            'city' => $validated['city'] ?? null,
            'subject' => $validated['subject'],
            'customerName' => $validated['customerName'],
            'customerAddress' => $validated['customerAddress'],
            'nomorPenawaran' => $validated['nomorPenawaran'] ?? null,
            'nomorPo' => $validated['nomorPo'] ?? null,
            'sumberQuotationId' => !empty($validated['sumberQuotationId']) ? (int) $validated['sumberQuotationId'] : null,
            'usePPN' => $usePPN,
            'ppnRate' => $usePPN ? $ppnRate : 0,
            'useSignatureStamp' => ($useSignature || $useStamp),
            'useSignature' => $useSignature,
            'useStamp' => $useStamp,
            'signatureImage' => $signatureAsset ? $signatureAsset->path : null,
            'stampImage' => $stampAsset ? $stampAsset->path : null,
            'signaturePosition' => $posTtd,
            'stampPosition' => $posStempel,
            'signature' => [
                'companyName' => (string) ($signatureBlock['companyName'] ?? ''),
                'signerName' => (string) ($signatureBlock['signerName'] ?? ''),
                'signerTitle' => (string) ($signatureBlock['signerTitle'] ?? ''),
            ],
            'bank' => [
                'bankName' => (string) ($validated['bankName'] ?? ''),
                'bankAccount' => (string) ($validated['bankAccount'] ?? ''),
                'bankOwner' => (string) ($validated['bankOwner'] ?? ''),
                'bankBranch' => (string) ($validated['bankBranch'] ?? ''),
            ],
            'notes' => array_values(array_filter(
                array_map('strval', $validated['notes'] ?? []),
                fn ($n) => trim($n) !== ''
            )),
            'totals' => [
                'total' => $total,
                'ppn' => $ppn,
                'ppnRate' => $usePPN ? $ppnRate : 0,
                'grandTotal' => $grandTotal,
            ],
        ];

        try {
            $idSurat = DB::transaction(function () use ($existing, $validated, $grandTotal, $dataJson, $signatureAssetId, $stampAssetId, $useSignature, $useStamp, $posTtd, $posStempel, $itemRows) {
                if ($existing) {
                    $id = (int) $existing->id_surat;
                    DB::table('tb_surat')->where('id_surat', $id)->update([
                        'nomor' => $validated['nomor'],
                        'tanggal' => $validated['tanggal'],
                        'total' => $grandTotal,
                        'data' => json_encode($dataJson),
                        'updated_at' => now(),
                        'id_asset_ttd' => $signatureAssetId,
                        'id_asset_stempel' => $stampAssetId,
                        'use_signature_stamp' => ($useSignature || $useStamp) ? 1 : 0,
                        'posisi_ttd' => $posTtd !== null ? json_encode($posTtd) : null,
                        'posisi_stempel' => $posStempel !== null ? json_encode($posStempel) : null,
                    ]);
                    DB::table('tb_surat_item')->where('id_surat', $id)->delete();
                } else {
                    $user = Auth::user();
                    $uuid = '';
                    do {
                        $uuid = 'INV-' . strtoupper(bin2hex(random_bytes(5)));
                    } while (DB::table('tb_surat')->where('uuid_surat', $uuid)->exists());

                    $id = DB::table('tb_surat')->insertGetId([
                        'uuid_surat' => $uuid,
                        'jenis' => 'invoice',
                        'nomor' => $validated['nomor'],
                        'tanggal' => $validated['tanggal'],
                        'created_by' => $user->id_user,
                        'total' => $grandTotal,
                        'data' => json_encode($dataJson),
                        'created_at' => now(),
                        'updated_at' => now(),
                        'id_asset_ttd' => $signatureAssetId,
                        'id_asset_stempel' => $stampAssetId,
                        'use_signature_stamp' => ($useSignature || $useStamp) ? 1 : 0,
                        'posisi_ttd' => $posTtd !== null ? json_encode($posTtd) : null,
                        'posisi_stempel' => $posStempel !== null ? json_encode($posStempel) : null,
                    ]);
                }

                foreach ($itemRows as &$itemRow) {
                    $itemRow['id_surat'] = $id;
                    DB::table('tb_surat_item')->insert($itemRow);
                }

                return $id;
            });
        } catch (QueryException $e) {
            Log::error('Gagal menyimpan invoice', ['error' => $e->getMessage()]);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan invoice. Silakan coba lagi.',
            ], 500);
        }

        return response()->json([
            'status' => 'ok',
            'message' => $existing ? 'Invoice berhasil diperbarui.' : 'Invoice berhasil disimpan.',
            'data' => [
                'id' => (int) $idSurat,
                'nomor' => $validated['nomor'],
                'tanggal' => $validated['tanggal'],
                'total' => $grandTotal,
                'jumlah_item' => count($itemRows),
            ],
        ], $existing ? 200 : 201);
    }

    /**
     * GET /api/surat/{jenis}/next-number?tanggal=YYYY-MM-DD
     *
     * Nomor berikutnya untuk jenis surat generik
     * (delivery-note, bast, inspection-request, payment-request,
     * kuitansi). Pola: PREFIX/DDMM[urutan]/ELMECH/YYYY,
     * dihitung dari tb_surat aktif (deleted_at IS NULL) -
     * bukan dari counter frontend.
     */
    public function nextSuratJenisNumber(Request $request, string $jenis): JsonResponse
    {
        if (!isset(self::SURAT_JENIS_PREFIX[$jenis])) {
            throw ValidationException::withMessages([
                'jenis' => ['Jenis surat tidak valid.'],
            ]);
        }

        $validated = $request->validate([
            'tanggal' => ['required', 'date'],
        ]);

        $prefix = self::SURAT_JENIS_PREFIX[$jenis];
        $next = $this->maxUrutanForTanggal($jenis, $prefix, $validated['tanggal']) + 1;

        return response()->json([
            'status' => 'ok',
            'data' => [
                'nomor' => $this->formatSuratNomor($prefix, $validated['tanggal'], $next),
                'tanggal' => $validated['tanggal'],
                'urutan' => $next,
            ],
        ], 200);
    }

    /**
     * POST /api/surat/{jenis}
     * Simpan surat generik ke tb_surat (jenis sesuai URL)
     * + tb_surat_item. Tanpa migration / tabel baru.
     */
    public function storeSuratJenis(Request $request, string $jenis): JsonResponse
    {
        return $this->saveSuratJenis($request, $jenis, null);
    }

    /**
     * PUT /api/surat/{id}/{jenis}
     * UPDATE record tb_surat yang SAMA (tidak INSERT baru).
     */
    public function updateSuratJenis(Request $request, string $id, string $jenis): JsonResponse
    {
        $surat = DB::table('tb_surat')->where('id_surat', $id)->where('jenis', $jenis)->first();
        if (!$surat) {
            return $this->notFound();
        }

        return $this->saveSuratJenis($request, $jenis, $surat);
    }

    /**
     * Core simpan/update surat generik - pola saveQuotation/saveInvoice
     * tanpa PPN/DP/bank (tidak dipakai jenis surat ini).
     */
    private function saveSuratJenis(Request $request, string $jenis, ?object $existing): JsonResponse
    {
        if (!isset(self::SURAT_JENIS_PREFIX[$jenis])) {
            throw ValidationException::withMessages([
                'jenis' => ['Jenis surat tidak valid.'],
            ]);
        }

        $isDeliveryNote = $jenis === 'delivery-note';
        $isBast = $jenis === 'bast';
        $isInspection = $jenis === 'inspection-request';
        $isPaymentRequest = $jenis === 'payment-request';
        $isKuitansi = $jenis === 'kuitansi';

        // Surat Jalan, BAST, Permohonan Pemeriksaan, Permohonan Pembayaran &
        // Kwitansi tidak punya field "Perihal" yang wajib diisi user, jadi
        // opsional agar submit tidak ditolak 422. Jenis surat lain tetap wajib.
        $subjectRules = ($isDeliveryNote || $isBast || $isInspection || $isPaymentRequest || $isKuitansi)
            ? ['nullable', 'string', 'max:255']
            : ['required', 'string', 'max:255'];

        // Modul tanpa harga: satuan bebas (mis. "Unit"/"Set"), volume boleh
        // kosong, alamat boleh kosong, penandatangan tidak dipaksa terisi.
        $noHarga = $isBast || $isInspection || $isPaymentRequest || $isKuitansi;
        $satuanRules = $noHarga
            ? ['nullable', 'string', 'max:50']
            : ['required', 'string', 'in:PCS,Paket,OH,LS'];
        $volumeRules = $noHarga
            ? ['nullable', 'numeric', 'min:0', 'max:999999999999']
            : ['required', 'numeric', 'gt:0', 'max:999999999999'];
        $addressRules = $noHarga
            ? ['nullable', 'string']
            : ['required', 'string'];

        $validated = $request->validate([
            'nomor' => ['required', 'string', 'max:50'],
            'tanggal' => ['required', 'date'],
            'city' => ['nullable', 'string', 'max:100'],
            'subject' => $subjectRules,
            'customerName' => ['required', 'string', 'max:255'],
            'customerAddress' => $addressRules,
            'nomorPenawaran' => ['nullable', 'string', 'max:100'],
            'nomorPO' => ['nullable', 'string', 'max:100'],
            'receiverName' => ['nullable', 'string', 'max:255'],
            // Field khusus BAST. Nullable supaya surat jenis lain
            // (yang memakai endpoint sama) tidak ikut wajib.
            'nomorSuratJalan' => ['nullable', 'string', 'max:100'],
            'nomorSPK' => ['nullable', 'string', 'max:255'],
            'tanggalSPK' => ['nullable', 'date'],
            'tanggalPelaksanaan' => ['nullable', 'date'],
            // Field khusus Surat Permohonan Pembayaran.
            'nomorBAST' => ['nullable', 'string', 'max:255'],
            'tanggalBAST' => ['nullable', 'date'],
            'perusahaanNama' => ['nullable', 'string', 'max:255'],
            'perusahaanAlamat' => ['nullable', 'string'],
            'dokumenPendukung' => ['nullable', 'array'],
            'dokumenPendukung.*' => ['nullable', 'string', 'max:255'],
            // Field khusus Kwitansi (nominal disimpan di kolom `total`).
            'nomorInvoice' => ['nullable', 'string', 'max:50'],
            'tanggalInvoice' => ['nullable', 'date'],
            'nominal' => ['nullable', 'numeric', 'min:0', 'max:9999999999999999'],
            'untukPembayaran' => ['nullable', 'string', 'max:1000'],
            'pihakPertamaNama' => ['nullable', 'string', 'max:255'],
            'pihakPertamaAlamat' => ['nullable', 'string'],
            'pihakKeduaNama' => ['nullable', 'string', 'max:255'],
            'pihakKeduaAlamat' => ['nullable', 'string'],
            'pihakPertamaPenandatangan' => ['nullable', 'string', 'max:255'],
            'signatureSide' => ['nullable', 'in:first,second'],
            'sumberSuratJalanId' => ['nullable', 'integer'],
            // Field khusus Surat Permohonan Pemeriksaan Hasil Pekerjaan.
            'sumberId' => ['nullable', 'integer'],
            'sumberJenis' => ['nullable', 'string', 'max:50'],
            'lampiran' => ['nullable', 'string', 'max:100'],
            'tujuanJabatan' => ['nullable', 'string', 'max:255'],
            'tujuanInstansi' => ['nullable', 'string', 'max:255'],
            'tujuanAlamat' => ['nullable', 'string'],
            'namaPekerjaan' => ['nullable', 'string', 'max:500'],
            'nomorSPK' => ['nullable', 'string', 'max:255'],
            'tanggalSPK' => ['nullable', 'date'],
            'notes' => ['nullable', 'array'],
            'notes.*' => ['string', 'max:1000'],
            // Kwitansi tidak punya item; nominal disimpan di kolom `total`.
            'items' => $isKuitansi ? ['nullable', 'array'] : ['required', 'array', 'min:1'],
            'items.*.nama_komponen' => ['required', 'string', 'max:500'],
            'items.*.spesifikasi' => ['nullable'],
            'items.*.volume' => $volumeRules,
            'items.*.satuan' => $satuanRules,
            'items.*.harga_satuan' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'useSignature' => ['sometimes', 'boolean'],
            'useStamp' => ['sometimes', 'boolean'],
            'signature_asset_id' => ['nullable', 'integer'],
            'stamp_asset_id' => ['nullable', 'integer'],
            'signaturePosition' => ['nullable', 'array'],
            'signaturePosition.x' => ['nullable', 'numeric'],
            'signaturePosition.y' => ['nullable', 'numeric'],
            'signaturePosition.zoom' => ['nullable', 'numeric', 'min:0.1', 'max:3'],
            'stampPosition' => ['nullable', 'array'],
            'stampPosition.x' => ['nullable', 'numeric'],
            'stampPosition.y' => ['nullable', 'numeric'],
            'stampPosition.zoom' => ['nullable', 'numeric', 'min:0.1', 'max:3'],
            'signature' => ['nullable', 'array'],
            'signature.companyName' => ['nullable', 'string', 'max:255'],
            'signature.signerName' => $noHarga
                ? ['nullable', 'string', 'max:255']
                : ['required', 'string', 'max:255'],
            'signature.signerTitle' => ['nullable', 'string', 'max:100'],
        ], [
            'nomor.required' => 'Nomor surat wajib diisi.',
            'tanggal.required' => 'Tanggal surat wajib diisi.',
            'subject.required' => 'Perihal surat wajib diisi.',
            'customerName.required' => 'Nama instansi/perusahaan wajib diisi.',
            'customerAddress.required' => 'Alamat penerima wajib diisi.',
            'items.required' => 'Minimal satu komponen harus ditambahkan.',
            'items.*.nama_komponen.required' => 'Nama komponen wajib diisi.',
            'items.*.volume.gt' => 'Volume harus lebih dari 0.',
            'items.*.satuan.in' => 'Satuan tidak valid. Pilihan: PCS, Paket, OH, LS.',
            'signature.signerName.required' => 'Nama penandatangan wajib diisi.',
        ]);

        // Nomor unik per jenis (surat aktif saja).
        $dupeQuery = DB::table('tb_surat')
            ->where('jenis', $jenis)
            ->where('nomor', $validated['nomor'])
            ->whereNull('deleted_at');
        if ($existing) {
            $dupeQuery->where('id_surat', '<>', $existing->id_surat);
        }
        if ($dupeQuery->exists()) {
            throw ValidationException::withMessages([
                'nomor' => ['Nomor surat sudah digunakan pada surat lain.'],
            ]);
        }

        $signatureAssetId = !empty($validated['signature_asset_id']) ? (int) $validated['signature_asset_id'] : null;
        $signatureAsset = null;
        if ($signatureAssetId !== null) {
            $signatureAsset = DB::table('tb_surat_asset')
                ->where('id_asset', $signatureAssetId)
                ->where('jenis', 'signature')
                ->whereNull('deleted_at')
                ->first();
            if (!$signatureAsset) {
                throw ValidationException::withMessages([
                    'signature_asset_id' => ['Asset tanda tangan tidak valid.'],
                ]);
            }
        }

        $stampAssetId = !empty($validated['stamp_asset_id']) ? (int) $validated['stamp_asset_id'] : null;
        $stampAsset = null;
        if ($stampAssetId !== null) {
            $stampAsset = DB::table('tb_surat_asset')
                ->where('id_asset', $stampAssetId)
                ->where('jenis', 'stamp')
                ->whereNull('deleted_at')
                ->first();
            if (!$stampAsset) {
                throw ValidationException::withMessages([
                    'stamp_asset_id' => ['Asset stempel tidak valid.'],
                ]);
            }
        }

        $itemRows = [];
        $total = 0;
        // Kwitansi tidak punya daftar item; nominal kwitansi yang menjadi
        // kolom `total` tb_surat (dipakai juga kolom JUMLAH di list).
        if ($isKuitansi) {
            $total = (int) round((float) ($validated['nominal'] ?? 0));
        }
        foreach ($validated['items'] ?? [] as $index => $item) {
            // BAST & Permohonan Pemeriksaan tidak memakai harga.
            $volume = isset($item['volume']) ? (float) $item['volume'] : 0;
            $harga = isset($item['harga_satuan']) ? (float) $item['harga_satuan'] : 0;
            if (!$isDeliveryNote && !$noHarga) {
                $total += (int) round($volume * $harga);
            }

            $specs = $item['spesifikasi'] ?? null;
            if (is_string($specs)) {
                $specs = array_values(array_filter(
                    array_map('trim', explode("\n", $specs)),
                    fn ($line) => $line !== ''
                ));
            }
            $specs = is_array($specs) ? array_values(array_map('strval', $specs)) : [];

            $itemRows[] = [
                'id_surat' => $existing ? (int) $existing->id_surat : 0,
                'no_urut' => $index + 1,
                'nama_komponen' => $item['nama_komponen'],
                'spesifikasi' => $specs === [] ? null : json_encode($specs),
                'volume' => $volume,
                // BAST & Permohonan Pemeriksaan tidak menyimpan satuan kosong.
                'satuan' => ($item['satuan'] ?? '') === '' ? null : $item['satuan'],
                'harga_satuan' => ($isDeliveryNote || $noHarga) ? 0 : (int) round($harga),
                'data' => null,
            ];
        }

        $useSignature = !empty($validated['useSignature']);

        $position = function (?array $pos): array {
            return [
                'x' => (float) ($pos['x'] ?? 0),
                'y' => (float) ($pos['y'] ?? 0),
                'zoom' => (float) ($pos['zoom'] ?? 1),
            ];
        };
        $posTtd = $useSignature
            ? $position(is_array($validated['signaturePosition'] ?? null) ? $validated['signaturePosition'] : null)
            : null;

        $useStamp = !empty($validated['useStamp']);
        $posStempel = $useStamp
            ? $position(is_array($validated['stampPosition'] ?? null) ? $validated['stampPosition'] : null)
            : null;

        $signatureBlock = is_array($validated['signature'] ?? null) ? $validated['signature'] : [];

        $dataJson = [
            'city' => $validated['city'] ?? null,
            'subject' => $validated['subject'] ?? '',
            'customerName' => $validated['customerName'],
            'customerAddress' => $validated['customerAddress'],
            'nomorPenawaran' => $validated['nomorPenawaran'] ?? null,
            'nomorPO' => $validated['nomorPO'] ?? null,
            'receiverName' => $validated['receiverName'] ?? null,
            'useSignature' => $useSignature,
            'useStamp' => $useStamp,
            'useSignatureStamp' => ($useSignature || $useStamp),
            'signatureImage' => $signatureAsset ? $signatureAsset->path : null,
            'stampImage' => $stampAsset ? $stampAsset->path : null,
            'signaturePosition' => $posTtd,
            'stampPosition' => $posStempel,
            'signature' => [
                'companyName' => (string) ($signatureBlock['companyName'] ?? ''),
                'signerName' => (string) ($signatureBlock['signerName'] ?? ''),
                'signerTitle' => (string) ($signatureBlock['signerTitle'] ?? ''),
            ],
            'notes' => array_values(array_filter(
                array_map('strval', $validated['notes'] ?? []),
                fn ($n) => trim($n) !== ''
            )),
            'totals' => [
                'total' => $total,
            ],
        ];

        // Field khusus BAST disimpan di JSON `data` yang sama. Tidak ada
        // kolom/migration baru - mengikuti pola field Surat Jalan.
        if ($isBast) {
            $dataJson['sumberSuratJalanId'] = $validated['sumberSuratJalanId'] ?? null;
            $dataJson['nomorSuratJalan'] = $validated['nomorSuratJalan'] ?? null;
            $dataJson['nomorSPK'] = $validated['nomorSPK'] ?? null;
            $dataJson['tanggalSPK'] = $validated['tanggalSPK'] ?? null;
            $dataJson['tanggalPelaksanaan'] = $validated['tanggalPelaksanaan'] ?? null;
            $dataJson['pihakPertamaNama'] = $validated['pihakPertamaNama'] ?? null;
            $dataJson['pihakPertamaAlamat'] = $validated['pihakPertamaAlamat'] ?? null;
            $dataJson['pihakKeduaNama'] = $validated['pihakKeduaNama'] ?? null;
            $dataJson['pihakKeduaAlamat'] = $validated['pihakKeduaAlamat'] ?? null;
            $dataJson['pihakPertamaPenandatangan'] = $validated['pihakPertamaPenandatangan'] ?? null;
            $dataJson['signatureSide'] = $validated['signatureSide'] ?? 'second';
        }

        // Field khusus Permohonan Pemeriksaan -> JSON `data` yang sama.
        if ($isInspection) {
            $dataJson['sumberId'] = $validated['sumberId'] ?? null;
            $dataJson['sumberJenis'] = $validated['sumberJenis'] ?? null;
            $dataJson['lampiran'] = $validated['lampiran'] ?? null;
            $dataJson['perihal'] = $validated['subject'] ?? '';
            $dataJson['tujuanJabatan'] = $validated['tujuanJabatan'] ?? null;
            $dataJson['tujuanInstansi'] = $validated['tujuanInstansi'] ?? null;
            $dataJson['tujuanAlamat'] = $validated['tujuanAlamat'] ?? null;
            $dataJson['namaPekerjaan'] = $validated['namaPekerjaan'] ?? null;
            $dataJson['nomorSPK'] = $validated['nomorSPK'] ?? null;
            $dataJson['tanggalSPK'] = $validated['tanggalSPK'] ?? null;
        }

        // Field khusus Permohonan Pembayaran -> JSON `data` yang sama.
        if ($isPaymentRequest) {
            $dataJson['sumberId'] = $validated['sumberId'] ?? null;
            $dataJson['sumberJenis'] = $validated['sumberJenis'] ?? null;
            $dataJson['lampiran'] = $validated['lampiran'] ?? null;
            $dataJson['perihal'] = $validated['subject'] ?? '';
            $dataJson['tujuanJabatan'] = $validated['tujuanJabatan'] ?? null;
            $dataJson['tujuanInstansi'] = $validated['tujuanInstansi'] ?? null;
            $dataJson['tujuanAlamat'] = $validated['tujuanAlamat'] ?? null;
            $dataJson['namaPekerjaan'] = $validated['namaPekerjaan'] ?? null;
            $dataJson['nomorSPK'] = $validated['nomorSPK'] ?? null;
            $dataJson['tanggalSPK'] = $validated['tanggalSPK'] ?? null;
            $dataJson['nomorBAST'] = $validated['nomorBAST'] ?? null;
            $dataJson['tanggalBAST'] = $validated['tanggalBAST'] ?? null;
            $dataJson['perusahaanNama'] = $validated['perusahaanNama'] ?? null;
            $dataJson['perusahaanAlamat'] = $validated['perusahaanAlamat'] ?? null;
            $dataJson['dokumenPendukung'] = array_values(array_filter(
                array_map('strval', $validated['dokumenPendukung'] ?? []),
                fn ($d) => trim($d) !== ''
            ));
        }

        // Field khusus Kwitansi -> JSON `data` yang sama. Nominal disimpan
        // di kolom `total` (sudah dihitung di atas), bukan kolom baru.
        if ($isKuitansi) {
            $dataJson['sumberId'] = $validated['sumberId'] ?? null;
            $dataJson['sumberJenis'] = $validated['sumberJenis'] ?? 'invoice';
            $dataJson['nomorInvoice'] = $validated['nomorInvoice'] ?? null;
            $dataJson['tanggalInvoice'] = $validated['tanggalInvoice'] ?? null;
            $dataJson['nominal'] = $total;
            $dataJson['untukPembayaran'] = $validated['untukPembayaran'] ?? null;
        }

        try {
            $idSurat = DB::transaction(function () use ($existing, $validated, $total, $dataJson, $signatureAssetId, $stampAssetId, $useSignature, $useStamp, $posTtd, $posStempel, $itemRows, $jenis) {
                if ($existing) {
                    $id = (int) $existing->id_surat;
                    DB::table('tb_surat')->where('id_surat', $id)->update([
                        'nomor' => $validated['nomor'],
                        'tanggal' => $validated['tanggal'],
                        'total' => $total,
                        'data' => json_encode($dataJson),
                        'updated_at' => now(),
                        'id_asset_ttd' => $signatureAssetId,
                        'id_asset_stempel' => $stampAssetId,
                        'use_signature_stamp' => ($useSignature || $useStamp) ? 1 : 0,
                        'posisi_ttd' => $posTtd !== null ? json_encode($posTtd) : null,
                        'posisi_stempel' => $posStempel !== null ? json_encode($posStempel) : null,
                    ]);
                    DB::table('tb_surat_item')->where('id_surat', $id)->delete();
                } else {
                    // created_by selalu dari user yang login, bukan input client.
                    $user = Auth::user();
                    $code = self::SURAT_JENIS_PREFIX[$jenis];
                    $uuid = '';
                    do {
                        $uuid = $code . '-' . strtoupper(bin2hex(random_bytes(5)));
                    } while (DB::table('tb_surat')->where('uuid_surat', $uuid)->exists());

                    $id = DB::table('tb_surat')->insertGetId([
                        'uuid_surat' => $uuid,
                        'jenis' => $jenis,
                        'nomor' => $validated['nomor'],
                        'tanggal' => $validated['tanggal'],
                        'created_by' => $user->id_user,
                        'total' => $total,
                        'data' => json_encode($dataJson),
                        'created_at' => now(),
                        'updated_at' => now(),
                        'id_asset_ttd' => $signatureAssetId,
                        'id_asset_stempel' => $stampAssetId,
                        'use_signature_stamp' => ($useSignature || $useStamp) ? 1 : 0,
                        'posisi_ttd' => $posTtd !== null ? json_encode($posTtd) : null,
                        'posisi_stempel' => $posStempel !== null ? json_encode($posStempel) : null,
                    ]);
                }

                foreach ($itemRows as &$itemRow) {
                    $itemRow['id_surat'] = $id;
                    DB::table('tb_surat_item')->insert($itemRow);
                }

                return $id;
            });
        } catch (QueryException $e) {
            Log::error('Gagal menyimpan surat', ['error' => $e->getMessage(), 'jenis' => $jenis]);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan surat. Silakan coba lagi.',
            ], 500);
        }

        return response()->json([
            'status' => 'ok',
            'message' => $existing ? 'Surat berhasil diperbarui.' : 'Surat berhasil disimpan.',
            'data' => [
                'id' => (int) $idSurat,
                'nomor' => $validated['nomor'],
                'tanggal' => $validated['tanggal'],
                'total' => $total,
                'jumlah_item' => count($itemRows),
            ],
        ], $existing ? 200 : 201);
    }

    /**
     * GET /api/surat/{id}
     * Returns a single surat by ID.
     */
    public function show(string $id): JsonResponse
    {
        $surat = DB::table('tb_surat')->where('id_surat', $id)->first();

        if (!$surat) {
            return $this->notFound();
        }

        return response()->json([
            'status' => 'ok',
            'data' => $this->present($surat),
        ], 200);
    }

    /**
     * POST /api/surat/quotation
     *
     * Stores a quotation letter: one row in tb_surat (with the whole
     * form in the `data` JSON, following the existing convention) and
     * one row per component in tb_surat_item. No schema change - only
     * INSERTs into the existing tables.
     *
     * `created_by` always comes from the authenticated user, never
     * from the request.
     */
    public function storeQuotation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            // Informasi surat
            'nomor' => ['required', 'string', 'max:50'],
            'tanggal' => ['required', 'date'],
            'city' => ['nullable', 'string', 'max:100'],
            'attachment' => ['nullable', 'string', 'max:100'],
            'subject' => ['required', 'string', 'max:255'],
            // Penerima
            'customerName' => ['required', 'string', 'max:255'],
            'customerAddress' => ['required', 'string'],
            'systemName' => ['required', 'string', 'max:255'],
            // Perhitungan
            'usePPN' => ['sometimes', 'boolean'],
            'ppnRate' => ['required_if:usePPN,true', 'nullable', 'numeric', 'min:0', 'max:100'],
            'useDP' => ['sometimes', 'boolean'],
            'dpRate' => ['required_if:useDP,true', 'nullable', 'numeric', 'min:0', 'max:100'],
            // Keterangan
            'notes' => ['nullable', 'array'],
            'notes.*' => ['string', 'max:1000'],
            // Item
            'items' => ['required', 'array', 'min:1'],
            'items.*.nama_komponen' => ['required', 'string', 'max:500'],
            'items.*.spesifikasi' => ['nullable'],
            'items.*.volume' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'items.*.satuan' => ['required', 'string', 'in:PCS,Paket,OH,LS'],
            'items.*.harga_satuan' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            // Penandatangan
            'useSignature' => ['sometimes', 'boolean'],
            'useStamp' => ['sometimes', 'boolean'],
            'signature_asset_id' => ['nullable', 'integer'],
            'stamp_asset_id' => ['nullable', 'integer'],
            'signaturePosition' => ['nullable', 'array'],
            'signaturePosition.x' => ['nullable', 'numeric'],
            'signaturePosition.y' => ['nullable', 'numeric'],
            'signaturePosition.zoom' => ['nullable', 'numeric', 'min:0.1', 'max:3'],
            'stampPosition' => ['nullable', 'array'],
            'stampPosition.x' => ['nullable', 'numeric'],
            'stampPosition.y' => ['nullable', 'numeric'],
            'stampPosition.zoom' => ['nullable', 'numeric', 'min:0.1', 'max:3'],
            'signature' => ['nullable', 'array'],
            'signature.companyName' => ['nullable', 'string', 'max:255'],
            'signature.signerName' => ['required', 'string', 'max:255'],
            'signature.signerTitle' => ['nullable', 'string', 'max:100'],
        ], [
            'nomor.required' => 'Nomor surat wajib diisi.',
            'tanggal.required' => 'Tanggal surat wajib diisi.',
            'subject.required' => 'Hal / judul surat wajib diisi.',
            'customerName.required' => 'Nama instansi/perusahaan wajib diisi.',
            'customerAddress.required' => 'Alamat penerima wajib diisi.',
            'systemName.required' => 'Nama/deskripsi sistem wajib diisi.',
            'items.required' => 'Minimal satu komponen penawaran harus ditambahkan.',
            'items.min' => 'Minimal satu komponen penawaran harus ditambahkan.',
            'items.*.nama_komponen.required' => 'Nama komponen wajib diisi.',
            'items.*.volume.required' => 'Volume wajib diisi.',
            'items.*.volume.gt' => 'Volume harus lebih dari 0.',
            'items.*.satuan.required' => 'Satuan wajib dipilih.',
            'items.*.satuan.in' => 'Satuan tidak valid. Pilihan: PCS, Paket, OH, LS.',
            'items.*.harga_satuan.required' => 'Harga satuan wajib diisi.',
            'ppnRate.required_if' => 'Persentase PPN wajib diisi.',
            'dpRate.required_if' => 'Persentase DP wajib diisi.',
            'signature.signerName.required' => 'Nama penandatangan wajib diisi.',
        ]);

        $user = Auth::user();

        // ---- Asset tanda tangan / stempel: harus ada di tb_surat_asset
        // dengan jenis yang sesuai dan belum dihapus. -----------------
        $signatureAssetId = !empty($validated['signature_asset_id']) ? (int) $validated['signature_asset_id'] : null;
        $stampAssetId = !empty($validated['stamp_asset_id']) ? (int) $validated['stamp_asset_id'] : null;

        $signatureAsset = null;
        if ($signatureAssetId !== null) {
            $signatureAsset = DB::table('tb_surat_asset')
                ->where('id_asset', $signatureAssetId)
                ->where('jenis', 'signature')
                ->whereNull('deleted_at')
                ->first();
            if (!$signatureAsset) {
                throw ValidationException::withMessages([
                    'signature_asset_id' => ['Asset tanda tangan tidak valid.'],
                ]);
            }
        }

        $stampAsset = null;
        if ($stampAssetId !== null) {
            $stampAsset = DB::table('tb_surat_asset')
                ->where('id_asset', $stampAssetId)
                ->where('jenis', 'stamp')
                ->whereNull('deleted_at')
                ->first();
            if (!$stampAsset) {
                throw ValidationException::withMessages([
                    'stamp_asset_id' => ['Asset stempel tidak valid.'],
                ]);
            }
        }

        // ---- Perhitungan dihitung ulang di server (input client tidak
        // pernah dipercaya sebagai sumber angka). ----------------------
        $itemRows = [];
        $total = 0;
        foreach ($validated['items'] as $index => $item) {
            $volume = (float) $item['volume'];
            $harga = (float) $item['harga_satuan'];
            $total += (int) round($volume * $harga);

            $specs = $item['spesifikasi'] ?? null;
            if (is_string($specs)) {
                $specs = array_values(array_filter(
                    array_map('trim', explode("\n", $specs)),
                    fn ($line) => $line !== ''
                ));
            }
            $specs = is_array($specs) ? array_values(array_map('strval', $specs)) : [];

            $itemRows[] = [
                'id_surat' => 0, // diisi setelah insert tb_surat
                'no_urut' => $index + 1,
                'nama_komponen' => $item['nama_komponen'],
                'spesifikasi' => $specs === [] ? null : json_encode($specs),
                'volume' => $volume,
                'satuan' => $item['satuan'],
                'harga_satuan' => (int) round($harga),
                'data' => null,
            ];
        }

        $usePPN = !empty($validated['usePPN']);
        $ppnRate = $usePPN ? (float) $validated['ppnRate'] : 0;
        $ppn = (int) round($total * $ppnRate / 100);
        $grandTotal = $total + $ppn;

        $useDP = !empty($validated['useDP']);
        $dpRate = $useDP ? (float) $validated['dpRate'] : 0;
        $dp = (int) round($grandTotal * $dpRate / 100);

        $useSignature = !empty($validated['useSignature']);
        $useStamp = !empty($validated['useStamp']);

        // Posisi disimpan dengan zoom sebagai multiplier (konvensi
        // baris existing: 1.58 dst), bukan persen.
        $position = function (?array $pos): array {
            return [
                'x' => (float) ($pos['x'] ?? 0),
                'y' => (float) ($pos['y'] ?? 0),
                'zoom' => (float) ($pos['zoom'] ?? 1),
            ];
        };
        $posTtd = $useSignature ? $position(is_array($validated['signaturePosition'] ?? null) ? $validated['signaturePosition'] : null) : null;
        $posStempel = $useStamp ? $position(is_array($validated['stampPosition'] ?? null) ? $validated['stampPosition'] : null) : null;

        $signatureBlock = is_array($validated['signature'] ?? null) ? $validated['signature'] : [];

        // `data` mengikuti konvensi JSON yang sudah dipakai baris
        // quotation existing (city/attachment/subject/customerName/
        // customerAddress/systemName/usePPN/.../signature/notes).
        $dataJson = [
            'city' => $validated['city'] ?? null,
            'attachment' => $validated['attachment'] ?? null,
            'subject' => $validated['subject'],
            'customerName' => $validated['customerName'],
            'customerAddress' => $validated['customerAddress'],
            'systemName' => $validated['systemName'],
            'usePPN' => $usePPN,
            'ppnRate' => $usePPN ? $ppnRate : 0,
            'useDP' => $useDP,
            'dpRate' => $useDP ? $dpRate : 0,
            'useSignatureStamp' => ($useSignature || $useStamp),
            'useSignature' => $useSignature,
            'useStamp' => $useStamp,
            'signatureImage' => $signatureAsset ? $signatureAsset->path : null,
            'stampImage' => $stampAsset ? $stampAsset->path : null,
            'signaturePosition' => $posTtd,
            'stampPosition' => $posStempel,
            'signature' => [
                'companyName' => (string) ($signatureBlock['companyName'] ?? ''),
                'signerName' => (string) ($signatureBlock['signerName'] ?? ''),
                'signerTitle' => (string) ($signatureBlock['signerTitle'] ?? ''),
            ],
            'notes' => array_values(array_filter(
                array_map('strval', $validated['notes'] ?? []),
                fn ($n) => trim($n) !== ''
            )),
            'totals' => [
                'total' => $total,
                'ppn' => $ppn,
                'ppnRate' => $usePPN ? $ppnRate : 0,
                'grandTotal' => $grandTotal,
                'dp' => $useDP ? $dp : 0,
                'dpRate' => $useDP ? $dpRate : 0,
            ],
        ];

        // ---- Nomor surat unik per jenis (uq_surat_jenis_nomor).
        // Nomor digenerate SERVER dari data aktif tb_surat + sequence
        // table (bukan dari client), supaya frontend & DB selalu sama.
        // Cek duplikat client tetap dijalankan untuk keamanan.
        $dupe = DB::table('tb_surat')
            ->where('jenis', 'quotation')
            ->where('nomor', $validated['nomor'])
            ->whereNull('deleted_at')
            ->exists();
        if ($dupe) {
            // Client mengirim nomor yang sudah dipakai - biarkan server
            // yang menggantikannya dengan nomor berikutnya di bawah.
            Log::info('Nomor dari client sudah dipakai, akan digenerate ulang', [
                'nomor_client' => $validated['nomor'],
            ]);
        }

        // uuid_surat varchar(30) NOT NULL UNIQUE. Format mengikuti
        // konvensi existing: "QR-" + 10 karakter hex.
        $uuid = '';
        do {
            $uuid = 'QR-' . strtoupper(bin2hex(random_bytes(5)));
        } while (DB::table('tb_surat')->where('uuid_surat', $uuid)->exists());

        try {
            $generatedNomor = null;
            $idSurat = DB::transaction(function () use ($validated, $user, $uuid, $grandTotal, $dataJson, $signatureAssetId, $stampAssetId, $useSignature, $useStamp, $posTtd, $posStempel, $itemRows, &$generatedNomor) {
                // Kunci baris sequence (jenis,tanggal) agar dua request
                // bersamaan terserialisasi; buat barisnya bila belum ada.
                DB::table('tb_nomor_surat_sequence')->insertOrIgnore([
                    'jenis' => 'quotation',
                    'tanggal' => $validated['tanggal'],
                    'urutan_terakhir' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $seq = DB::table('tb_nomor_surat_sequence')
                    ->where('jenis', 'quotation')
                    ->where('tanggal', $validated['tanggal'])
                    ->lockForUpdate()
                    ->first();

                // Nomor berikutnya = urutan terbesar surat penawaran
                // AKTIF hari itu + 1 (soft-deleted tidak dihitung).
                $next = $this->maxQuotationUrutanForTanggal($validated['tanggal']) + 1;

                DB::table('tb_nomor_surat_sequence')
                    ->where('id', $seq->id)
                    ->update(['urutan_terakhir' => $next, 'updated_at' => now()]);

                $nomor = $this->formatQuotationNomor($validated['tanggal'], $next);
                $generatedNomor = $nomor;

                $id = DB::table('tb_surat')->insertGetId([
                    'uuid_surat' => $uuid,
                    'jenis' => 'quotation',
                    'nomor' => $nomor,
                    'tanggal' => $validated['tanggal'],
                    'created_by' => $user->id_user,
                    'total' => $grandTotal,
                    'data' => json_encode($dataJson),
                    'created_at' => now(),
                    'updated_at' => now(),
                    'id_asset_ttd' => $signatureAssetId,
                    'id_asset_stempel' => $stampAssetId,
                    'use_signature_stamp' => ($useSignature || $useStamp) ? 1 : 0,
                    'posisi_ttd' => $posTtd !== null ? json_encode($posTtd) : null,
                    'posisi_stempel' => $posStempel !== null ? json_encode($posStempel) : null,
                ]);

                foreach ($itemRows as &$itemRow) {
                    $itemRow['id_surat'] = $id;
                    DB::table('tb_surat_item')->insert($itemRow);
                }

                return $id;
            });
        } catch (QueryException $e) {
            Log::error('Gagal menyimpan surat penawaran', [
                'error' => $e->getMessage(),
                'nomor' => $generatedNomor ?? null,
            ]);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan surat. Silakan coba lagi.',
            ], 500);
        }

        Log::info('Surat penawaran tersimpan', [
            'id_surat' => $idSurat,
            'uuid' => $uuid,
            'nomor' => $generatedNomor,
            'created_by' => $user->id_user,
            'jumlah_item' => count($itemRows),
        ]);

        return response()->json([
            'status' => 'ok',
            'message' => 'Surat penawaran berhasil disimpan.',
            'data' => [
                'id' => (int) $idSurat,
                'uuid' => $uuid,
                'nomor' => $generatedNomor,
                'tanggal' => $validated['tanggal'],
                'jenis' => 'quotation',
                'total' => $grandTotal,
                'jumlah_item' => count($itemRows),
            ],
        ], 201);
    }

    /**
     * GET /api/surat/{id}/pdf
     *
     * Streams the saved quotation as an A4 PDF that mirrors the
     * live preview (same header/footer artwork, same content
     * safe-area offsets, repeating table header on page breaks).
     */
    public function pdf(string $id)
    {
        $surat = DB::table('tb_surat')
            ->where('id_surat', $id)
            ->where('jenis', 'quotation')
            ->first();

        if (!$surat) {
            return $this->notFound();
        }

        $items = DB::table('tb_surat_item')
            ->where('id_surat', $id)
            ->orderBy('no_urut')
            ->get();

        try {
            $renderer = app(QuotationPdfRenderer::class);
            $pdfBytes = $renderer->render($surat, $items);
        } catch (Throwable $e) {
            Log::error('Gagal generate PDF surat penawaran', [
                'id_surat' => $id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal membuat PDF. Silakan coba lagi.',
            ], 500);
        }

        $filename = 'Surat-Penawaran-' . preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) $surat->nomor) . '.pdf';

        return response()->streamDownload(
            function () use ($pdfBytes) {
                echo $pdfBytes;
            },
            $filename,
            [
                'Content-Type' => 'application/pdf',
                'Cache-Control' => 'no-store',
            ]
        );
    }

    /**
     * POST /api/surat/quotation/pdf-from-html
     *
     * Renders the exact Live Preview HTML (serialized from the on-screen
     * preview, with the application's live CSS) through Chrome headless
     * --print-to-pdf, so the PDF matches the Live Preview 1:1.
     */
    public function pdfFromHtml(Request $request)
    {
        $validated = $request->validate([
            'html' => ['required', 'string', 'max:20971520'], // ~20 MB
        ]);

        $tmpHtml = tempnam(sys_get_temp_dir(), 'quotation_') . '.html';
        $tmpPdf = tempnam(sys_get_temp_dir(), 'quotation_') . '.pdf';
        file_put_contents($tmpHtml, $validated['html']);

        $chrome = $this->chromeBinaryPath();
        if (!$chrome) {
            return response()->json([
                'status' => 'error',
                'message' => 'Chrome tidak ditemukan di server. Hubungi administrator.',
            ], 500);
        }

        $cmd = sprintf(
            '%s --headless=new --disable-gpu --no-pdf-header-footer --disable-extensions --virtual-time-budget=10000 --print-to-pdf=%s %s',
            escapeshellarg($chrome),
            escapeshellarg($tmpPdf),
            escapeshellarg('file:///' . str_replace('\\', '/', $tmpHtml))
        );

        // Jalankan Chrome dengan TIMEOUT keras (60 detik). Tanpa batas ini,
        // proses Chrome yang menggantung akan memblokir PHP dev server
        // (single-threaded) selamanya dan menggantung seluruh API.
        $timeoutSec = 60;
        $process = proc_open($cmd, [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ], $pipes);

        $outputLines = '';
        $timedOut = false;
        if (is_resource($process)) {
            fclose($pipes[0]);
            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);
            $start = microtime(true);
            do {
                $status = proc_get_status($process);
                $outputLines .= stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
                if ($status['running'] && (microtime(true) - $start) > $timeoutSec) {
                    $timedOut = true;
                    proc_terminate($process);
                    @proc_close($process);
                    break;
                }
                if (!$status['running']) break;
                usleep(200000);
            } while (true);
            if (!$timedOut) {
                proc_close($process);
            }
        } else {
            $timedOut = false;
        }

        if ($timedOut || !file_exists($tmpPdf) || filesize($tmpPdf) < 1000) {
            Log::error('Chrome print-to-pdf gagal', ['timedOut' => $timedOut, 'output' => trim($outputLines)]);
            @unlink($tmpHtml);
            @unlink($tmpPdf);

            return response()->json([
                'status' => 'error',
                'message' => $timedOut
                    ? 'Gagal membuat PDF: proses Chrome melebihi batas waktu. Silakan coba lagi.'
                    : 'Gagal membuat PDF. Silakan coba lagi.',
            ], 500);
        }

        $pdfBytes = file_get_contents($tmpPdf);
        @unlink($tmpHtml);
        @unlink($tmpPdf);

        return response()->streamDownload(function () use ($pdfBytes) {
            echo $pdfBytes;
        }, 'Surat-Penawaran.pdf', [
            'Content-Type' => 'application/pdf',
            'Cache-Control' => 'no-store',
        ]);
    }

    /** Locate the Chrome binary on this machine. */
    private function chromeBinaryPath(): ?string
    {
        $candidates = [
            env('CHROME_PATH'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ];
        foreach ($candidates as $path) {
            if ($path && is_file($path)) {
                return $path;
            }
        }

        return null;
    }

    // ------------------------------------------------------------------ helpers

    /**
     * Urutan terbesar yang sudah dipakai surat penawaran AKTIF pada
     * tanggal tertentu, diambil dari pola nomor "PNR/DDMM[urutan]/ELMECH/YYYY".
     * Soft-deleted (deleted_at != null) dan jenis selain quotation
     * tidak dihitung.
     */
    private function maxQuotationUrutanForTanggal(string $tanggal): int
    {
        return $this->maxUrutanForTanggal('quotation', 'PNR', $tanggal);
    }

    /** Generic: urutan terbesar surat AKTIF suatu jenis pada tanggal tsb. */
    private function maxUrutanForTanggal(string $jenis, string $prefix, string $tanggal): int
    {
        $ts = strtotime($tanggal);
        $dd = date('d', $ts);
        $mm = date('m', $ts);

        $nomors = DB::table('tb_surat')
            ->where('jenis', $jenis)
            ->where('tanggal', $tanggal)
            ->whereNull('deleted_at')
            ->pluck('nomor');

        $max = 0;
        foreach ($nomors as $nomor) {
            if (preg_match('/^' . preg_quote($prefix, '/') . '\/(\d{2})(\d{2})(\d+)\/ELMECH\/\d{4}$/', (string) $nomor, $m)
                && $m[1] === $dd && $m[2] === $mm) {
                $max = max($max, (int) $m[3]);
            }
        }

        return $max;
    }

    /** "PNR/DDMM[urutan]/ELMECH/YYYY" - mengikuti contoh existing. */
    private function formatQuotationNomor(string $tanggal, int $urutan): string
    {
        return $this->formatSuratNomor('PNR', $tanggal, $urutan);
    }

    private function formatSuratNomor(string $prefix, string $tanggal, int $urutan): string
    {
        $ts = strtotime($tanggal);

        return sprintf('%s/%s%s%d/ELMECH/%s', $prefix, date('d', $ts), date('m', $ts), $urutan, date('Y', $ts));
    }

    /**
     * Turn a tb_surat row into an API payload.
     */
    private function present(object $row): array
    {
        $data = json_decode((string) $row->data, true) ?? [];

        // Extract useful fields from JSON for display
        $perihal = $data['subject'] ?? $data['perihal'] ?? '-';
        $pengirim = $data['customerName'] ?? $data['pengirim'] ?? '-';
        // Kolom NOMOR INVOICE di list Kwitansi. Key ini tidak dibaca modul
        // lain, jadi aman ditambahkan tanpa mengubah kontrak API yang ada.
        $nomorInvoice = $data['nomorInvoice'] ?? null;
        $status = $data['status'] ?? ($row->deleted_at ? 'Dihapus' : 'Aktif');

        // Map status to badge variant
        $statusVariant = match (true) {
            stripos($status, 'dibaca') !== false => 'success',
            stripos($status, 'belum') !== false => 'warning',
            stripos($status, 'dihapus') !== false => 'danger',
            default => 'default',
        };

        return [
            'id' => (int) $row->id_surat,
            'uuid' => $row->uuid_surat,
            'nomor' => $row->nomor,
            'jenis' => $row->jenis,
            'tanggal' => $row->tanggal,
            'perihal' => $perihal,
            'pengirim' => $pengirim,
            'nomorInvoice' => $nomorInvoice,
            'status' => $status,
            'status_variant' => $statusVariant,
            'total' => (int) ($row->total ?? 0),
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
        ];
    }

    /**
     * Real jenis list from the enum, with a live surat count so the
     * filter dropdown can never drift from the database.
     */
    private function jenisOptions(): array
    {
        $rows = DB::table('tb_surat')
            ->select('jenis', DB::raw('COUNT(*) as count'))
            ->groupBy('jenis')
            ->orderBy('jenis')
            ->get();

        $options = [];
        foreach (self::VALID_JENIS as $jenis) {
            $count = 0;
            foreach ($rows as $row) {
                if ($row->jenis === $jenis) {
                    $count = (int) $row->count;
                    break;
                }
            }
            $options[] = [
                'value' => $jenis,
                'label' => $this->jenisLabel($jenis),
                'count' => $count,
            ];
        }

        return $options;
    }

    private function jenisLabel(string $jenis): string
    {
        return match ($jenis) {
            'quotation' => 'Penawaran',
            'invoice' => 'Invoice',
            'delivery-note' => 'Surat Jalan',
            'bast' => 'BAST',
            'inspection-request' => 'Permintaan Inspeksi',
            'payment-request' => 'Permintaan Pembayaran',
            'kuitansi' => 'Kuitansi',
            default => ucfirst(str_replace('-', ' ', $jenis)),
        };
    }

    /**
     * Real status list from the data JSON and deleted_at, with live count.
     */
    private function statusOptions(): array
    {
        $validStatus = ['Dibaca', 'Belum Dibaca', 'Aktif', 'Dihapus'];
        $options = [];

        foreach ($validStatus as $status) {
            $query = DB::table('tb_surat');

            if ($status === 'Dihapus') {
                $query->where(function ($q) {
                    $q->whereNotNull('deleted_at')
                        ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = ?", ['Dihapus']);
                });
            } elseif ($status === 'Aktif') {
                $query->whereNull('deleted_at')
                    ->where(function ($q) {
                        $q->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) IS NULL")
                            ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) NOT IN (?)", [['Dihapus']]);
                    });
            } else {
                $query->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = ?", [$status]);
            }

            $count = $query->count();

            $options[] = [
                'value' => $status,
                'label' => $status,
                'count' => (int) $count,
            ];
        }

        return $options;
    }

    /**
     * Escape the LIKE wildcards so a user typing "100%" or "a_b" searches for
     * those literal characters instead of turning them into patterns.
     */
    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'status' => 'error',
            'message' => 'Surat tidak ditemukan.',
        ], 404);
    }
}