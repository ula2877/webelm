import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, RotateCcw, Eye, Edit2, Trash2, Loader2, FileDown } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ReceiptPreview from '../components/ReceiptPreview';
import { buildPreviewHtml } from '../utils/quotationPrintHtml';
import * as suratService from '../services/surat';
import { KW_PRINT_CSS, formatRupiah, formFromReceiptDetail } from '../utils/receipt';

const ITEMS_PER_PAGE = 6;
const JENIS_FILTER = 'kuitansi';
const CFG = {
  routeBase: 'letters/receipt',
  label: 'Kwitansi',
  pdfPrefix: 'Kwitansi',
};

// Halaman list Kwitansi.
// Pola UI/behavior mengikuti halaman Surat Penawaran: search debounce
// (500ms) + Reset Filter, tabel
// NOMOR|PENERIMA|NOMOR INVOICE|JUMLAH|TANGGAL|AKSI, aksi icon
// View/Edit/Download/Delete (hard delete), pagination.
export default function SuratReceipt() {
  const navigate = useNavigate();
  const [surat, setSurat] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [pdfForm, setPdfForm] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, item: null });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const searchInputRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const showNoticeRef = useRef(null);
  showNoticeRef.current = (type, message) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchSuratData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await suratService.fetchSurat({
        search: debouncedSearchQuery,
        jenis: JENIS_FILTER,
        page: currentPage,
        perPage: ITEMS_PER_PAGE,
      });
      if (response.status === 'ok') {
        const lastPage = Math.max(1, response.meta.last_page);
        if (response.data.length === 0 && currentPage > lastPage) {
          setCurrentPage(lastPage);
          return;
        }
        setSurat(response.data);
        setTotalPages(response.meta.last_page);
        setTotalItems(response.meta.total);
      }
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal memuat data kwitansi');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchQuery, currentPage]);

  useEffect(() => {
    fetchSuratData();
  }, [fetchSuratData]);

  const handleResetFilter = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setCurrentPage(1);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  // Download PDF dari list: ambil detail, render preview offscreen,
  // serialize -> PDF identik dengan halaman Create/View.
  const handleDownloadPdf = async (s) => {
    if (downloadingId) return;
    setDownloadingId(s.id);
    try {
      const res = await suratService.fetchQuotationDetail(s.id);
      if (res?.status !== 'ok' || !res.data) {
        showNoticeRef.current('error', 'Gagal mengambil data kwitansi.');
        return;
      }
      setPdfForm({ id: s.id, form: formFromReceiptDetail(res.data).form, nomor: res.data.nomor });
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal membuat PDF.');
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (!pdfForm) return undefined;
    let cancelled = false;
    const run = async () => {
      try {
        await document.fonts?.ready;
        // beri waktu preview selesai dirender sebelum diserialisasi
        await new Promise((r) => setTimeout(r, 600));
        if (cancelled) return;
        const html = await buildPreviewHtml(KW_PRINT_CSS);
        const blob = await suratService.downloadQuotationPdfFromHtml(html);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nomor = (pdfForm.nomor || 'kwitansi').replace(/[\\/:*?"<>|]+/g, '_');
        a.download = `${CFG.pdfPrefix}-${nomor}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        if (!cancelled) {
          showNoticeRef.current('error', err.message || 'Gagal membuat PDF.');
        }
      } finally {
        if (!cancelled) {
          setPdfForm(null);
          setDownloadingId(null);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [pdfForm]);

  // Hard delete (pola Surat Penawaran).
  const handleDeleteConfirm = async () => {
    const item = deleteConfirm.item;
    if (!item || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await suratService.deleteSurat(item.id);
      setDeleteConfirm({ isOpen: false, item: null });
      if (res?.status === 'ok') {
        showNoticeRef.current('success', 'Kwitansi berhasil dihapus secara permanen.');
        fetchSuratData();
      } else {
        showNoticeRef.current('error', res?.message || 'Gagal menghapus kwitansi.');
      }
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal menghapus kwitansi.');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {notice && (
        <div
          className={`flex items-start gap-3 p-4 rounded-lg border ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
          role="status"
        >
          <p className="text-sm flex-1">{notice.message}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Tutup notifikasi"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="page-title">{CFG.label}</h2>
          <p className="page-subtitle">Kelola kwitansi pembayaran</p>
        </div>
        <Button icon={Plus} onClick={() => navigate(`/${CFG.routeBase}/create`)}>
          Buat Kwitansi
        </Button>
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
                placeholder="Cari kwitansi..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
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
            title="Tidak ada kwitansi"
            description="Coba ubah filter pencarian Anda"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-gray-50/50">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Nomor
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Penerima
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Nomor Invoice
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Jumlah
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Tanggal
                    </th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {surat.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6 text-sm font-medium text-text-primary">
                        {s.nomor}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-primary">{s.pengirim || '-'}</td>
                      <td className="py-4 px-6 text-sm text-text-secondary">
                        {s.nomorInvoice || '-'}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary tabular-nums">
                        {formatRupiah(s.total)}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{s.tanggal}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Lihat"
                            onClick={() => navigate(`/${CFG.routeBase}/${s.id}/view`)}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Edit"
                            onClick={() => navigate(`/${CFG.routeBase}/${s.id}/edit`)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Download PDF"
                            disabled={downloadingId !== null}
                            onClick={() => handleDownloadPdf(s)}
                          >
                            {downloadingId === s.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileDown className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Hapus"
                            onClick={() => setDeleteConfirm({ isOpen: true, item: s })}
                          >
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

      {/* Offscreen preview untuk generate PDF dari list */}
      {pdfForm && (
        <div style={{ position: 'absolute', left: -10000, top: 0 }} aria-hidden="true">
          <ReceiptPreview form={pdfForm.form} />
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, item: null })}
        onConfirm={handleDeleteConfirm}
        title={`Hapus ${CFG.label}?`}
        message={`Apakah Anda yakin ingin menghapus kwitansi ${
          deleteConfirm.item?.nomor || ''
        }?\nKwitansi akan dihapus secara permanen dan tidak dapat dipulihkan.`}
        confirmLabel="Hapus Permanen"
        cancelLabel="Batal"
        loading={deleteBusy}
      />
    </div>
  );
}
