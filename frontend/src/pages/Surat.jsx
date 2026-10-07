import { FileText, Plus, Search, Filter, RotateCcw, Eye, Edit2, Trash2, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select } from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as suratService from '../services/surat';
import { formatDate } from '../utils/helpers';

const ITEMS_PER_PAGE = 6;

export default function Surat() {
  const [surat, setSurat] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  // Ref for search input to maintain focus
  const searchInputRef = useRef(null);

  // Notice helper
  const noticeTimerRef = useRef(null);
  const showNoticeRef = useRef(null);
  showNoticeRef.current = (type, message) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  };

  // Debounce search query - 500ms delay (same as Users)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch surat from API
  const fetchSuratData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await suratService.fetchSurat({
        search: debouncedSearchQuery,
        status: statusFilter,
        page: currentPage,
        perPage: ITEMS_PER_PAGE,
      });
      if (response.status === 'ok') {
        const lastPage = Math.max(1, response.meta.last_page);
        // If last page becomes empty after delete, go back to last valid page
        if (response.data.length === 0 && currentPage > lastPage) {
          setCurrentPage(lastPage);
          return;
        }
        setSurat(response.data);
        setTotalPages(response.meta.last_page);
        setTotalItems(response.meta.total);
      }
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal memuat data surat');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchQuery, statusFilter, currentPage]);

  useEffect(() => {
    fetchSuratData();
  }, [fetchSuratData]);

  // Reset filter
  const handleResetFilter = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setStatusFilter('');
    setCurrentPage(1);
    // Focus search input after state updates
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Notice */}
      {notice && (
        <div
          className={`flex items-start gap-3 p-4 rounded-lg border ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
          role="status"
        >
          {notice.type === 'success' ? (
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          <p className="text-sm flex-1">{notice.message}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Tutup notifikasi"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="page-title">Surat</h2>
          <p className="page-subtitle">Kelola surat masuk dan keluar</p>
        </div>
        <Button icon={Plus}>Buat Surat</Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Cari surat..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-40"
              disabled={isLoading}
            >
              <option value="">Semua Status</option>
              <option value="Dibaca">Dibaca</option>
              <option value="Belum Dibaca">Belum Dibaca</option>
            </Select>
            <Button
              variant="secondary"
              icon={RotateCcw}
              onClick={handleResetFilter}
              disabled={isLoading}
              className="whitespace-nowrap"
            >
              Reset Filter
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden !p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : surat.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Tidak ada surat"
            description="Coba ubah filter pencarian Anda"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-gray-50/50">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Nomor</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Perihal</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Penerima</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Tanggal</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {surat.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6 text-sm font-medium text-text-primary">{s.nomor}</td>
                      <td className="py-4 px-6 text-sm text-text-primary">{s.perihal}</td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{s.pengirim}</td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{s.tanggal}</td>
                      <td className="py-4 px-6">
                        <Badge variant={s.status_variant} dot>{s.status}</Badge>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <button className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Lihat">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Edit">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors" title="Hapus">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-border">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={totalItems}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}