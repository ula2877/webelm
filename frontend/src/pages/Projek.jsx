import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, RotateCcw, Eye, Pencil, Trash2, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import * as projectService from '../services/projects';
import { rupiah } from '../utils/suratJenis';
import {
  PROJECT_JENIS,
  PROJECT_PELUNASAN_VARIANT,
  PROJECT_STATUS_VARIANT,
  PROJECT_URGENCY,
  PROJECT_URGENCY_VARIANT,
  projectPelunasanLabel,
  projectStatusLabel,
  projectUrgencyLabel,
} from '../utils/projects';

const ITEMS_PER_PAGE = 6;
const CFG = {
  routeBase: 'projects',
  label: 'Projek',
};

// Halaman list Projek (data dari GET /api/projects).
// Pola UI/behavior mengikuti halaman Surat: search debounce (500ms) +
// Reset Filter, tabel KODE|NAMA|CUSTOMER|TANGGAL|STATUS|AKSI, aksi icon
// View (modal detail) / Edit / Delete (confirm dialog), pagination server.
export default function Projek() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState(location.state?.notice || null);
  const [viewItem, setViewItem] = useState(null);
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

  // Hapus location.state setelah dibaca supaya notice tidak muncul lagi
  // saat kembali ke halaman ini (pola redirect-after-save).
  useEffect(() => {
    if (location.state?.notice) {
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchProjectsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await projectService.fetchProjects({
        search: debouncedSearchQuery,
        page: currentPage,
        perPage: ITEMS_PER_PAGE,
      });
      if (response.status === 'ok') {
        const lastPage = Math.max(1, response.meta.last_page);
        if (response.data.length === 0 && currentPage > lastPage) {
          setCurrentPage(lastPage);
          return;
        }
        setProjects(response.data);
        setTotalPages(response.meta.last_page);
        setTotalItems(response.meta.total);
      }
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal memuat data projek');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchQuery, currentPage]);

  useEffect(() => {
    fetchProjectsData();
  }, [fetchProjectsData]);

  const handleResetFilter = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setCurrentPage(1);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  // View mengambil detail lengkap (workers + pembayaran) via
  // GET /api/projects/{id}; baris list hanya membawa agregat.
  const handleView = async (id) => {
    try {
      const res = await projectService.fetchProjectDetail(id);
      if (res?.status === 'ok' && res.data) {
        setViewItem(res.data);
      } else {
        showNoticeRef.current('error', 'Gagal memuat detail projek.');
      }
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal memuat detail projek.');
    }
  };

  // Hard delete via API (row benar-benar hilang dari tb_project).
  const handleDeleteConfirm = async () => {
    const item = deleteConfirm.item;
    if (!item || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await projectService.deleteProject(item.id);
      setDeleteConfirm({ isOpen: false, item: null });
      if (res?.status === 'ok') {
        showNoticeRef.current('success', 'Projek berhasil dihapus secara permanen.');
        fetchProjectsData();
      } else {
        showNoticeRef.current('error', res?.message || 'Gagal menghapus projek.');
      }
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal menghapus projek.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const jenisLabel = (value) =>
    PROJECT_JENIS.find((j) => j.value === value)?.label || value || '-';
  const urgencyLabel = (value) =>
    PROJECT_URGENCY.find((u) => u.value === value)?.label || value || '-';

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
          <p className="page-subtitle">Kelola data projek</p>
        </div>
        <Button icon={Plus} onClick={() => navigate(`/${CFG.routeBase}/create`)}>
          Buat Projek
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
                placeholder="Cari projek..."
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
        ) : projects.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Tidak ada projek"
            description="Coba ubah filter pencarian Anda"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-gray-50/50">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Projek
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Tanggal Mulai
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Tanggal Estimasi
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Tanggal Selesai
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Harga
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Pelunasan
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Urgency
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Kolom PROJEK: customer (atas, muted) + nama (bawah, bold). */}
                      <td className="py-4 px-6">
                        <p className="text-xs font-normal text-text-secondary leading-5">
                          {p.client || '-'}
                        </p>
                        <p className="text-sm font-bold text-text-primary leading-5">
                          {p.name}
                        </p>
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary whitespace-nowrap">
                        {p.startDate || '-'}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary whitespace-nowrap">
                        {p.estimasiDate || '-'}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary whitespace-nowrap">
                        {p.endDate || '-'}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary tabular-nums whitespace-nowrap">
                        {rupiah(p.harga || 0)}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <Badge variant={PROJECT_PELUNASAN_VARIANT[p.pelunasan] || 'default'}>
                          {projectPelunasanLabel(p.pelunasan)}
                        </Badge>
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <Badge variant={PROJECT_URGENCY_VARIANT[p.urgency] || 'default'}>
                          {projectUrgencyLabel(p.urgency)}
                        </Badge>
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <Badge variant={PROJECT_STATUS_VARIANT[p.status] || 'default'}>
                          {projectStatusLabel(p.status)}
                        </Badge>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Lihat"
                            onClick={() => handleView(p.id)}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Edit"
                            onClick={() => navigate(`/${CFG.routeBase}/${p.id}/edit`)}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Hapus"
                            onClick={() => setDeleteConfirm({ isOpen: true, item: p })}
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

      {/* Detail projek (read-only, tanpa route tambahan). */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title="Detail Projek">
        {viewItem && (
          <div className="p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Kode Projek</p>
              <p className="mt-1 text-sm font-medium text-text-primary">{viewItem.code}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Nama Projek</p>
              <p className="mt-1 text-sm text-text-primary">{viewItem.name}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Customer</p>
                <p className="mt-1 text-sm text-text-primary">{viewItem.client || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Status</p>
                <p className="mt-1">
                  <Badge variant={PROJECT_STATUS_VARIANT[viewItem.status] || 'default'}>
                    {projectStatusLabel(viewItem.status)}
                  </Badge>
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Jenis</p>
                <p className="mt-1 text-sm text-text-primary">{jenisLabel(viewItem.jenis)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Urgency</p>
                <p className="mt-1 text-sm text-text-primary">{urgencyLabel(viewItem.urgency)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Tanggal Mulai</p>
                <p className="mt-1 text-sm text-text-primary">{viewItem.startDate || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Tanggal Estimasi</p>
                <p className="mt-1 text-sm text-text-primary">{viewItem.estimasiDate || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Tanggal Selesai</p>
                <p className="mt-1 text-sm text-text-primary">{viewItem.endDate || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Harga</p>
                <p className="mt-1 text-sm text-text-primary">{rupiah(viewItem.harga || 0)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Deskripsi</p>
              <p className="mt-1 text-sm text-text-secondary whitespace-pre-line">
                {viewItem.description || '-'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Worker</p>
              <p className="mt-1 text-sm text-text-primary">
                {Array.isArray(viewItem.workers) && viewItem.workers.length > 0
                  ? viewItem.workers.map((w) => w.nama || `#${w.id}`).join(', ')
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Pembayaran
                <span className="ml-2 normal-case font-medium">
                  (Total: {rupiah(viewItem.total_pembayaran || 0)})
                </span>
              </p>
              {Array.isArray(viewItem.pembayaran) && viewItem.pembayaran.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {viewItem.pembayaran.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <span className="text-sm text-text-primary tabular-nums">
                        {rupiah(b.nominal || 0)}
                      </span>
                      <Badge variant={PROJECT_PELUNASAN_VARIANT[b.pelunasan] || 'default'}>
                        {projectPelunasanLabel(b.pelunasan)}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-text-muted">Belum ada pembayaran.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, item: null })}
        onConfirm={handleDeleteConfirm}
        title="Hapus Projek?"
        message={`Apakah Anda yakin ingin menghapus projek ${
          deleteConfirm.item?.code || ''
        }?\nData akan dihapus secara permanen dan tidak dapat dipulihkan.`}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        loading={deleteBusy}
      />
    </div>
  );
}
