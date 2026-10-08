import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, RotateCcw, Eye, Pencil, Trash2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import { deleteProject, listProjects, PROJECT_STATUS_VARIANT } from '../utils/projects';

const ITEMS_PER_PAGE = 6;
const CFG = {
  routeBase: 'projects',
  label: 'Projek',
};

// Halaman list Projek (mock frontend sementara).
// Pola UI/behavior mengikuti halaman Surat: search debounce (500ms) +
// Reset Filter, tabel KODE|NAMA|CUSTOMER|TANGGAL|STATUS|AKSI, aksi icon
// View (modal detail) / Edit / Delete (confirm dialog), pagination.
export default function Projek() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState(() => listProjects());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [notice, setNotice] = useState(location.state?.notice || null);
  const [viewItem, setViewItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, item: null });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const searchInputRef = useRef(null);
  const noticeTimerRef = useRef(null);

  // Hapus location.state setelah dibaca supaya notice tidak muncul lagi
  // saat kembali ke halaman ini (pola redirect-after-save).
  useEffect(() => {
    if (location.state?.notice) {
      navigate(location.pathname, { replace: true });
      noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
    }
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Muat ulang dari store setiap halaman ini dikunjungi (data bisa berubah
  // di halaman create/edit).
  useEffect(() => {
    setProjects(listProjects());
  }, [location.key]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filtered = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return projects
      .filter(
        (p) =>
          !q ||
          [p.code, p.name, p.customer]
            .map((v) => String(v || '').toLowerCase())
            .some((v) => v.includes(q))
      )
      .slice()
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [projects, debouncedSearchQuery]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const handleResetFilter = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setCurrentPage(1);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const showNotice = (type, message) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  };

  // Hapus dari mock store (tanpa API).
  const handleDeleteConfirm = () => {
    const item = deleteConfirm.item;
    if (!item || deleteBusy) return;
    setDeleteBusy(true);
    try {
      if (deleteProject(item.id)) {
        setProjects(listProjects());
        showNotice('success', 'Projek berhasil dihapus.');
      } else {
        showNotice('error', 'Gagal menghapus projek.');
      }
    } finally {
      setDeleteConfirm({ isOpen: false, item: null });
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
              className="whitespace-nowrap"
            >
              Reset Filter
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden !p-0">
        {pageRows.length === 0 ? (
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
                      Kode Projek
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Nama Projek
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Tanggal
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
                  {pageRows.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6 text-sm font-medium text-text-primary">
                        {p.code}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-primary">{p.name}</td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{p.customer}</td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{p.startDate || '-'}</td>
                      <td className="py-4 px-6 text-sm">
                        <Badge variant={PROJECT_STATUS_VARIANT[p.status] || 'default'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Lihat"
                            onClick={() => setViewItem(p)}
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
                currentPage={safePage}
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
                <p className="mt-1 text-sm text-text-primary">{viewItem.customer}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Status</p>
                <p className="mt-1">
                  <Badge variant={PROJECT_STATUS_VARIANT[viewItem.status] || 'default'}>
                    {viewItem.status}
                  </Badge>
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Tanggal Mulai</p>
                <p className="mt-1 text-sm text-text-primary">{viewItem.startDate || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Tanggal Selesai</p>
                <p className="mt-1 text-sm text-text-primary">{viewItem.endDate || '-'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Deskripsi</p>
              <p className="mt-1 text-sm text-text-secondary whitespace-pre-line">
                {viewItem.description || '-'}
              </p>
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
        }?\nData akan dihapus dari daftar dan tidak dapat dipulihkan.`}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        loading={deleteBusy}
      />
    </div>
  );
}
