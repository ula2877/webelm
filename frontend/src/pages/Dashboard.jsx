import { useEffect, useMemo, useState } from 'react';
import {
  FolderKanban,
  Wallet,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Info,
} from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { PageLoading } from '../components/ui/LoadingSpinner';
import ProjectCountChart from '../components/charts/ProjectCountChart';
import IncomeChart from '../components/charts/IncomeChart';
import PelunasanChart from '../components/charts/PelunasanChart';
import MonthlyRecapTable from '../components/MonthlyRecapTable';
import { fetchDashboard } from '../services/dashboard';
import { rupiah } from '../utils/suratJenis';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const selectClass =
  'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

/** Satu baris angka di dalam card KPI. */
function StatLine({ label, value, tone = 'text-text-primary', icon: Icon }) {
  return (
    <div className="flex items-center justify-between gap-3" data-stat-line>
      <span
        className="flex items-center gap-2 text-sm text-text-secondary"
        data-stat-label
      >
        {Icon && <Icon className="w-4 h-4" />}
        {label}
      </span>
      <span className={`text-lg font-bold ${tone}`} data-stat-value={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * Dashboard khusus worker - hanya projek yang ditugaskan ke user yang login
 * (data sudah dibatasi di backend lewat tb_tim; ini murni tampilan).
 */
function WorkerDashboardView({ projects = {}, series = [] }) {
  const total = projects.total ?? 0;
  const isEmpty = total === 0;

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch"
      data-worker-layout
    >
      {/* Kolom kiri: Projek Dikerjakan (2/5 = 40% di desktop). */}
      <Card className="space-y-4 lg:col-span-2">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
            <FolderKanban className="w-5 h-5" />
          </span>
          <h3 className="text-base font-semibold text-text-primary">Projek Dikerjakan</h3>
        </div>
        <div className="space-y-3">
          <StatLine label="Running" value={projects.running ?? 0} tone="text-blue-600" icon={Clock} />
          <StatLine label="Done" value={projects.done ?? 0} tone="text-emerald-600" icon={CheckCircle2} />
          <StatLine label="Total" value={total} />
        </div>
        <p className="text-xs text-text-muted">
          Total = seluruh projek yang pernah ditugaskan kepada Anda (termasuk
          yang dibatalkan); setiap projek dihitung satu kali.
        </p>
      </Card>

      {/* Kolom kanan: Tren Projek (3/5 = 60% di desktop). */}
      {isEmpty ? (
        <Card className="lg:col-span-3">
          <EmptyState
            icon={FolderKanban}
            title="Belum ada projek ditugaskan"
            description="Projek yang melibatkan Anda akan muncul di sini begitu admin menugaskan Anda."
          />
        </Card>
      ) : (
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Tren Projek (6 Bulan Terakhir)</CardTitle>
          </CardHeader>
          <ProjectCountChart data={series} />
        </Card>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [initialPeriod] = useState(() => {
    const d = new Date();
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });
  const [month, setMonth] = useState(initialPeriod.month);
  const [year, setYear] = useState(initialPeriod.year);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');

    fetchDashboard({ month, year, range: 6 })
      .then((res) => {
        if (!active) return;
        if (res?.status === 'ok') {
          setData(res.data);
        } else {
          setError('Gagal memuat data dashboard.');
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err?.response?.data?.message || err?.message || 'Gagal memuat data dashboard.'
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [month, year, reloadKey]);

  const period = data?.period;
  const isWorker = data?.scope === 'worker';
  const workerName = data?.worker?.nama;
  const projects = data?.projects;
  const income = data?.income;
  const pelunasan = data?.pelunasan;
  const series = data?.series || [];
  const monthlyRecap = data?.monthly_recap || [];
  const highlightKey = `${year}-${String(month).padStart(2, '0')}`;

  const yearOptions = useMemo(() => {
    if (data?.available_years?.length) return data.available_years;
    return Array.from({ length: 6 }, (_, i) => initialPeriod.year - i);
  }, [data?.available_years, initialPeriod.year]);

  const isEmpty =
    !isLoading &&
    !error &&
    projects &&
    projects.done + projects.running + projects.cancel === 0 &&
    (income?.total_pembayaran ?? 0) === 0 &&
    (pelunasan?.total ?? 0) === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + pemilih periode */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">
            {isWorker
              ? `Ringkasan projek yang ditugaskan${workerName ? ` — ${workerName}` : ''}`
              : 'Ringkasan projek &amp; pendapatan ELMECH'}
            {!isWorker && period?.label ? ` — ${period.label}` : ''}
          </p>
        </div>
        {!isWorker && (
        <div className="flex items-end gap-3">
          <div>
            <label htmlFor="dash-month" className="block text-xs font-medium text-text-secondary mb-1">
              Bulan
            </label>
            <select
              id="dash-month"
              aria-label="Pilih bulan"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={selectClass}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dash-year" className="block text-xs font-medium text-text-secondary mb-1">
              Tahun
            </label>
            <select
              id="dash-year"
              aria-label="Pilih tahun"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={selectClass}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        )}
      </div>

      {isLoading && <PageLoading />}

      {!isLoading && error && (
        <ErrorState
          title="Gagal memuat dashboard"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {!isLoading && !error && data && (isWorker ? (
        <WorkerDashboardView projects={data.projects} series={data.series || []} />
      ) : (
        <>
          {isEmpty && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-text-secondary">
              <Info className="w-4 h-4 flex-shrink-0 text-primary-600" />
              Belum ada projek maupun pembayaran pada periode {period?.label}.
            </div>
          )}

          {/* KPI */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5" />
                </span>
                <h3 className="text-base font-semibold text-text-primary">Projek Dikerjakan</h3>
              </div>
              <div className="space-y-3">
                <StatLine label="Done" value={projects.done} tone="text-emerald-600" icon={CheckCircle2} />
                <StatLine label="Running" value={projects.running} tone="text-blue-600" icon={Clock} />
                <StatLine label="Total Dikerjakan" value={projects.total} />
              </div>
              {projects.cancel > 0 && (
                <p className="text-xs text-text-muted">
                  {projects.cancel} projek dibatalkan (cancel) tidak dihitung.
                </p>
              )}
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </span>
                <h3 className="text-base font-semibold text-text-primary">Income Projek</h3>
              </div>
              <div>
                <p className="text-sm text-text-secondary">Total Pembayaran Diterima</p>
                <p className="mt-1 text-2xl font-bold text-text-primary">
                  {rupiah(income.total_pembayaran)}
                </p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">Total Nilai Projek Running</p>
                <p className="mt-1 text-lg font-semibold text-blue-600">
                  {rupiah(income.total_nilai_running)}
                </p>
              </div>
              {income.payment_date_available === false && (
                <p className="text-xs text-text-muted">
                  Pembayaran dikaitkan ke bulan tanggal mulai projek terkait (data
                  pembayaran tidak menyimpan tanggal transaksi).
                </p>
              )}
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <BadgeCheck className="w-5 h-5" />
                </span>
                <h3 className="text-base font-semibold text-text-primary">Ringkasan Pelunasan</h3>
              </div>
              <div className="space-y-3">
                <StatLine label="Lunas" value={pelunasan.lunas} tone="text-emerald-600" />
                <StatLine label="Belum Lunas" value={pelunasan.belum_lunas} tone="text-amber-600" />
              </div>
              <p className="text-xs text-text-muted">
                Lunas = punya transaksi pelunasan &lsquo;lunas&rsquo;; Belum Lunas termasuk DP
                atau belum ada pembayaran.
              </p>
            </Card>
          </div>

          {/* Chart projek + pelunasan */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Tren Projek (6 Bulan Terakhir)</CardTitle>
              </CardHeader>
              <ProjectCountChart data={series} />
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pelunasan</CardTitle>
              </CardHeader>
              <PelunasanChart lunas={pelunasan.lunas} belumLunas={pelunasan.belum_lunas} />
            </Card>
          </div>

          {/* Chart pendapatan */}
          <Card>
            <CardHeader>
              <CardTitle>Pendapatan Bulanan (6 Bulan Terakhir)</CardTitle>
            </CardHeader>
            <IncomeChart data={series} highlightKey={highlightKey} />
          </Card>

          {/* Rekap bulanan 12 bulan - tren historis independen dari selector */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-6 pt-6">
              <CardHeader className="!mb-1">
                <CardTitle>Rekap Bulanan Projek</CardTitle>
              </CardHeader>
              <p className="text-xs text-text-muted mb-4">
                Jumlah projek dihitung dari tanggal mulai; income adalah total
                pembayaran projek pada bulan tersebut. Karena data pembayaran tidak
                menyimpan tanggal transaksi, bulan income mengikuti tanggal mulai
                projek terkait.
              </p>
            </div>
            <div className="px-6 pb-4">
              <MonthlyRecapTable rows={monthlyRecap} highlightKey={highlightKey} />
            </div>
          </Card>
        </>
        ))}
    </div>
  );
}
