<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard statistik projek & pendapatan (read-only, tanpa perubahan schema).
 *
 * Sumber data (tabel existing):
 *   - tb_project     : tanggal_mulai, status, harga
 *   - tb_pembayaran  : id_project, nominal, pelunasan
 *
 * CATATAN PENTING (tb_pembayaran tanpa kolom tanggal):
 *   tb_pembayaran TIDAK menyimpan tanggal transaksi. Karena itu, untuk
 *   laporan bulanan, nominal pembayaran dikaitkan ke bulan `tanggal_mulai`
 *   projeknya (satu-satunya informasi waktu yang benar-benar tersedia tanpa
 *   mengubah schema dan tanpa mengarang tanggal). Setiap baris pembayaran
 *   tetap dihitung tepat SATU kali, dan harga projek tidak pernah dijumlahkan
 *   berulang walau projek punya banyak pembayaran.
 */
class DashboardController extends Controller
{
    private const MONTHS_SHORT = [
        1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr', 5 => 'Mei', 6 => 'Jun',
        7 => 'Jul', 8 => 'Agu', 9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
    ];

    private const MONTHS_LONG = [
        1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April', 5 => 'Mei', 6 => 'Juni',
        7 => 'Juli', 8 => 'Agustus', 9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember',
    ];

    /** GET /api/dashboard?month=&year=&range= */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'month' => ['nullable', 'integer', 'between:1,12'],
            'year' => ['nullable', 'integer', 'between:2000,2100'],
            'range' => ['nullable', 'integer', 'between:3,12'],
        ], [
            'month.integer' => 'Bulan tidak valid.',
            'month.between' => 'Bulan harus antara 1 sampai 12.',
            'year.integer' => 'Tahun tidak valid.',
            'year.between' => 'Tahun harus antara 2000 sampai 2100.',
            'range.integer' => 'Rentang bulan tidak valid.',
            'range.between' => 'Rentang bulan harus antara 3 sampai 12.',
        ]);

        $now = now();
        $month = (int) ($validated['month'] ?? $now->month);
        $year = (int) ($validated['year'] ?? $now->year);
        $range = (int) ($validated['range'] ?? 6);

        // Batas periode terpilih (inklusif-eksklusif) & rentang tren bulanan.
        $selected = Carbon::createFromDate($year, $month, 1)->startOfMonth();
        $start = $selected->copy()->startOfMonth();
        $endExclusive = $selected->copy()->addMonthNoOverflow()->startOfMonth();
        $rangeStart = $selected->copy()->subMonthsNoOverflow($range - 1)->startOfMonth();

        $startStr = $start->toDateString();
        $endStr = $endExclusive->toDateString();

        // ---- KPI projek periode terpilih (1 query, GROUP BY status) ----
        $statusCounts = ['done' => 0, 'running' => 0, 'cancel' => 0];
        $statusRows = DB::table('tb_project')
            ->selectRaw('status, COUNT(*) as aggregate')
            ->where('tanggal_mulai', '>=', $startStr)
            ->where('tanggal_mulai', '<', $endStr)
            ->groupBy('status')
            ->get();
        foreach ($statusRows as $row) {
            $statusCounts[$row->status] = (int) $row->aggregate;
        }

        $done = $statusCounts['done'];
        $running = $statusCounts['running'];
        $cancel = $statusCounts['cancel'];

        // ---- KPI income periode terpilih ----
        // Setiap baris tb_pembayaran dihitung sekali (join 1:1 dari sisi
        // pembayaran), jadi nominal tidak pernah ganda.
        $totalPembayaran = (int) DB::table('tb_pembayaran as b')
            ->join('tb_project as p', 'p.id_project', '=', 'b.id_project')
            ->where('p.tanggal_mulai', '>=', $startStr)
            ->where('p.tanggal_mulai', '<', $endStr)
            ->sum('b.nominal');

        // Nilai kontrak projek running - dibaca langsung dari tb_project
        // (tanpa join) sehingga harga tidak berulang.
        $totalNilaiRunning = (int) DB::table('tb_project')
            ->where('status', 'running')
            ->where('tanggal_mulai', '>=', $startStr)
            ->where('tanggal_mulai', '<', $endStr)
            ->sum('harga');

        // ---- Ringkasan pelunasan periode terpilih ----
        // Lunas = ada minimal satu transaksi 'lunas'; Belum Lunas = sisanya
        // (tanpa transaksi atau hanya DP). Sama seperti logika halaman Projek,
        // hanya dibatasi periode tanggal_mulai.
        $lunasCount = (int) DB::table('tb_project as p')
            ->where('p.tanggal_mulai', '>=', $startStr)
            ->where('p.tanggal_mulai', '<', $endStr)
            ->whereExists(function ($q) {
                $q->selectRaw('1')
                    ->from('tb_pembayaran as b')
                    ->whereColumn('b.id_project', 'p.id_project')
                    ->where('b.pelunasan', 'lunas');
            })
            ->count();

        $periodTotal = $done + $running + $cancel;
        $belumLunas = max(0, $periodTotal - $lunasCount);

        // ---- Tren bulanan (1 query per metrik, bukan per bulan) ----
        $monthlyStatus = [];
        $projectRows = DB::table('tb_project')
            ->selectRaw("DATE_FORMAT(tanggal_mulai, '%Y-%m') as ym, status, COUNT(*) as aggregate")
            ->where('tanggal_mulai', '>=', $rangeStart->toDateString())
            ->where('tanggal_mulai', '<=', $selected->copy()->endOfMonth()->toDateString())
            ->groupBy('ym', 'status')
            ->get();
        foreach ($projectRows as $row) {
            $monthlyStatus[$row->ym][$row->status] = (int) $row->aggregate;
        }

        $monthlyPayments = [];
        $paymentRows = DB::table('tb_pembayaran as b')
            ->join('tb_project as p', 'p.id_project', '=', 'b.id_project')
            ->selectRaw("DATE_FORMAT(p.tanggal_mulai, '%Y-%m') as ym, COALESCE(SUM(b.nominal), 0) as total")
            ->where('p.tanggal_mulai', '>=', $rangeStart->toDateString())
            ->where('p.tanggal_mulai', '<=', $selected->copy()->endOfMonth()->toDateString())
            ->groupBy('ym')
            ->get();
        foreach ($paymentRows as $row) {
            $monthlyPayments[$row->ym] = (int) $row->total;
        }

        $monthlyRunning = [];
        $runningRows = DB::table('tb_project')
            ->selectRaw("DATE_FORMAT(tanggal_mulai, '%Y-%m') as ym, COALESCE(SUM(harga), 0) as total")
            ->where('status', 'running')
            ->where('tanggal_mulai', '>=', $rangeStart->toDateString())
            ->where('tanggal_mulai', '<=', $selected->copy()->endOfMonth()->toDateString())
            ->groupBy('ym')
            ->get();
        foreach ($runningRows as $row) {
            $monthlyRunning[$row->ym] = (int) $row->total;
        }

        $series = [];
        $cursor = $rangeStart->copy();
        while ($cursor->lessThanOrEqualTo($selected)) {
            $ym = $cursor->format('Y-m');
            $series[] = [
                'key' => $ym,
                'month' => (int) $cursor->month,
                'year' => (int) $cursor->year,
                'label' => self::MONTHS_SHORT[(int) $cursor->month] . ' ' . $cursor->year,
                'done' => $monthlyStatus[$ym]['done'] ?? 0,
                'running' => $monthlyStatus[$ym]['running'] ?? 0,
                'pembayaran' => $monthlyPayments[$ym] ?? 0,
                'nilai_running' => $monthlyRunning[$ym] ?? 0,
            ];
            $cursor->addMonthNoOverflow();
        }

        // ---- Tahun yang bisa dipilih (dari data nyata + tahun berjalan) ----
        $dataYears = DB::table('tb_project')
            ->selectRaw('MIN(YEAR(tanggal_mulai)) AS min_y, MAX(YEAR(tanggal_mulai)) AS max_y')
            ->first();
        $minYear = $dataYears && $dataYears->min_y ? (int) $dataYears->min_y : $year;
        $maxYear = $dataYears && $dataYears->max_y ? (int) $dataYears->max_y : $year;
        // Batasi ke rentang yang diterima endpoint (validasi 2000-2100) supaya
        // tanggal rusak/legacy (mis. '0000-00-00') tidak meledakkan daftar tahun.
        $minYear = max(2000, min($minYear, $year));
        $maxYear = min(2100, max($maxYear, $year, $now->year));
        $availableYears = range($minYear, $maxYear);

        return response()->json([
            'status' => 'ok',
            'data' => [
                'period' => [
                    'month' => $month,
                    'year' => $year,
                    'label' => self::MONTHS_LONG[$month] . ' ' . $year,
                    'start' => $startStr,
                    'end' => $endExclusive->copy()->subDay()->toDateString(),
                ],
                'range_months' => $range,
                'projects' => [
                    'done' => $done,
                    'running' => $running,
                    'cancel' => $cancel,
                    // Total "dikerjakan" = done + running (cancel tidak ikut).
                    'total' => $done + $running,
                ],
                'income' => [
                    'total_pembayaran' => $totalPembayaran,
                    'total_nilai_running' => $totalNilaiRunning,
                    // Transparansi keterbatasan schema.
                    'payment_date_available' => false,
                    'payment_attribution' => 'project_tanggal_mulai',
                ],
                'pelunasan' => [
                    'lunas' => $lunasCount,
                    'belum_lunas' => $belumLunas,
                    'total' => $periodTotal,
                ],
                'series' => $series,
                'available_years' => $availableYears,
            ],
        ], 200);
    }
}
