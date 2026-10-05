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

        // Nomor surat unik per jenis (uq_surat_jenis_nomor).
        $dupe = DB::table('tb_surat')
            ->where('jenis', 'quotation')
            ->where('nomor', $validated['nomor'])
            ->whereNull('deleted_at')
            ->exists();
        if ($dupe) {
            throw ValidationException::withMessages([
                'nomor' => ['Nomor surat sudah digunakan pada surat penawaran lain.'],
            ]);
        }

        // uuid_surat varchar(30) NOT NULL UNIQUE. Format mengikuti
        // konvensi existing: "QR-" + 10 karakter hex.
        $uuid = '';
        do {
            $uuid = 'QR-' . strtoupper(bin2hex(random_bytes(5)));
        } while (DB::table('tb_surat')->where('uuid_surat', $uuid)->exists());

        try {
            $idSurat = DB::transaction(function () use ($validated, $user, $uuid, $grandTotal, $dataJson, $signatureAssetId, $stampAssetId, $useSignature, $useStamp, $posTtd, $posStempel, $itemRows) {
                $id = DB::table('tb_surat')->insertGetId([
                    'uuid_surat' => $uuid,
                    'jenis' => 'quotation',
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

                foreach ($itemRows as &$itemRow) {
                    $itemRow['id_surat'] = $id;
                    DB::table('tb_surat_item')->insert($itemRow);
                }

                return $id;
            });
        } catch (QueryException $e) {
            Log::error('Gagal menyimpan surat penawaran', [
                'error' => $e->getMessage(),
                'nomor' => $validated['nomor'],
            ]);

            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menyimpan surat. Silakan coba lagi.',
            ], 500);
        }

        Log::info('Surat penawaran tersimpan', [
            'id_surat' => $idSurat,
            'uuid' => $uuid,
            'nomor' => $validated['nomor'],
            'created_by' => $user->id_user,
            'jumlah_item' => count($itemRows),
        ]);

        return response()->json([
            'status' => 'ok',
            'message' => 'Surat penawaran berhasil disimpan.',
            'data' => [
                'id' => (int) $idSurat,
                'uuid' => $uuid,
                'nomor' => $validated['nomor'],
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

    // ------------------------------------------------------------------ helpers

    /**
     * Turn a tb_surat row into an API payload.
     */
    private function present(object $row): array
    {
        $data = json_decode((string) $row->data, true) ?? [];

        // Extract useful fields from JSON for display
        $perihal = $data['subject'] ?? $data['perihal'] ?? '-';
        $pengirim = $data['customerName'] ?? $data['pengirim'] ?? '-';
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