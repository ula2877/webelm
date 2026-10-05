<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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