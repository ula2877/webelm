import { FileText, Plus, ArrowRight, ChevronRight, TrendingUp, Loader2, Clock, ExternalLink } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import * as suratService from '../services/surat';
import { formatDate } from '../utils/helpers';

// 7 Jenis Surat lengkap sesuai enum database
const JENIS_SURAT = [
  {
    key: 'quotation',
    label: 'Surat Penawaran',
    shortLabel: 'Penawaran',
    route: '/letters/quotation',
    createRoute: '/letters/quotation/create',
    icon: FileText,
    color: 'blue',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  {
    key: 'invoice',
    label: 'Invoice',
    shortLabel: 'Invoice',
    route: '/letters/invoice',
    createRoute: '/letters/invoice/create',
    icon: FileText,
    color: 'green',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  {
    key: 'delivery-note',
    label: 'Surat Jalan',
    shortLabel: 'Surat Jalan',
    route: '/letters/delivery-note',
    createRoute: '/letters/delivery-note/create',
    icon: FileText,
    color: 'orange',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-200',
  },
  {
    key: 'bast',
    label: 'Berita Acara Serah Terima',
    shortLabel: 'BAST',
    route: '/letters/handover',
    createRoute: '/letters/handover/create',
    icon: FileText,
    color: 'purple',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  {
    key: 'inspection-request',
    label: 'Surat Permohonan Pemeriksaan Hasil Pekerjaan',
    shortLabel: 'Permohonan Pemeriksaan',
    route: '/letters/inspection-request',
    createRoute: '/letters/inspection-request/create',
    icon: FileText,
    color: 'indigo',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-200',
  },
  {
    key: 'payment-request',
    label: 'Surat Permohonan Pembayaran',
    shortLabel: 'Permohonan Pembayaran',
    route: '/letters/payment-request',
    createRoute: '/letters/payment-request/create',
    icon: FileText,
    color: 'red',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
  },
  {
    key: 'kuitansi',
    label: 'Kwitansi',
    shortLabel: 'Kwitansi',
    route: '/letters/receipt',
    createRoute: '/letters/receipt/create',
    icon: FileText,
    color: 'teal',
    bgColor: 'bg-teal-50',
    textColor: 'text-teal-700',
    borderColor: 'border-teal-200',
  },
];

export default function SuratOverview() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({});
  const [recentLetters, setRecentLetters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  // Fetch counts from API using jenis_options which already includes counts
  const fetchCounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await suratService.fetchSurat({ perPage: 1 });
      if (response.status === 'ok' && response.jenis_options) {
        const countMap = {};
        response.jenis_options.forEach((opt) => {
          countMap[opt.value] = opt.count;
        });
        setCounts(countMap);
      }
    } catch (err) {
      console.error('Gagal memuat jumlah surat:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch recent letters (latest 5 across all jenis)
  const fetchRecentLetters = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const response = await suratService.fetchSurat({ 
        perPage: 5, 
        page: 1 
      });
      if (response.status === 'ok') {
        setRecentLetters(response.data);
      }
    } catch (err) {
      console.error('Gagal memuat surat terbaru:', err);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    fetchRecentLetters();
  }, [fetchCounts, fetchRecentLetters]);

  const handleNavigate = (route) => {
    navigate(route);
  };

  const handleCreateClick = (e, route) => {
    e.stopPropagation();
    navigate(route);
  };

  const handleManageClick = (e, route) => {
    e.stopPropagation();
    navigate(route);
  };

  const totalSurat = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="page-title">Surat</h2>
          <p className="page-subtitle">Kelola seluruh dokumen surat</p>
        </div>
      </div>

      {/* KPI Cards Grid - 7 Jenis Surat */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {JENIS_SURAT.map((jenis) => {
          const count = counts[jenis.key] ?? 0;
          const Icon = jenis.icon;
          return (
            <Card
              key={jenis.key}
              className={`
                ${jenis.bgColor} ${jenis.borderColor}
                transition-all duration-200
                hover:shadow-lg hover:-translate-y-1
                flex flex-col
              `}
              onClick={() => handleNavigate(jenis.route)}
              onKeyDown={(e) => e.key === 'Enter' && handleNavigate(jenis.route)}
              tabIndex={0}
              role="button"
              aria-label={`Lihat ${jenis.label}, jumlah: ${count}`}
            >
              <div className="w-full flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-secondary uppercase tracking-wider truncate">
                    {jenis.label}
                  </p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className={`text-3xl font-bold ${jenis.textColor}`}>
                      {isLoading ? (
                        <span className="w-16 h-8 bg-gray-200 animate-pulse rounded inline-block" />
                      ) : (
                        count
                      )}
                    </span>
                    {!isLoading && (
                      <span className={`text-sm font-medium ${jenis.textColor}`}>
                        {count === 1 ? 'Surat' : 'Surat'}
                      </span>
                    )}
                  </div>
                </div>
                <div className={`p-3 rounded-xl ${jenis.bgColor} ${jenis.borderColor} shrink-0`}>
                  <Icon className={`w-8 h-8 ${jenis.textColor}`} />
                </div>
              </div>
              <div className="w-full mt-4 pt-4 border-t border-gray-200 flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ExternalLink}
                  className="flex-1 justify-center"
                  onClick={(e) => handleManageClick(e, jenis.route)}
                >
                  Kelola Surat
                </Button>
                <Button
                  size="sm"
                  icon={Plus}
                  className="flex-1 justify-center"
                  onClick={(e) => handleCreateClick(e, jenis.createRoute)}
                >
                  Buat Surat
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Recent Letters */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-text-muted" />
            <h3 className="text-lg font-semibold text-text-primary">Surat Terbaru</h3>
          </div>
        </div>

        {isLoadingRecent ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg animate-pulse">
                <div className="w-10 h-10 bg-gray-200 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : recentLetters.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Belum ada surat</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Nomor</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Jenis Surat</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Perihal</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Tanggal</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentLetters.map((s) => {
                  // Find jenis label
                  const jenisInfo = JENIS_SURAT.find(j => j.key === s.jenis);
                  const jenisLabel = jenisInfo ? jenisInfo.label : s.jenis;
                  
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4 text-sm font-medium text-text-primary">{s.nomor || '-'}</td>
                      <td className="py-3 px-4 text-sm text-text-secondary">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {jenisLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-text-primary max-w-xs truncate">{s.perihal}</td>
                      <td className="py-3 px-4 text-sm text-text-secondary">{s.tanggal}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => navigate(jenisInfo?.route || '/letters/quotation')}
                          className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                          title="Lihat"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Footer */}
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm text-text-secondary">
          <span>Total <span className="font-semibold text-text-primary">{totalSurat || (isLoading ? '...' : '0')}</span> surat dalam sistem</span>
          <span className="text-text-muted">Diperbarui: {new Date().toLocaleDateString('id-ID')}</span>
        </div>
      </Card>
    </div>
  );
}