import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, RotateCcw, AlertTriangle, Loader2, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select, Textarea } from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { formatDate } from '../utils/helpers';
import * as usersService from '../services/users';
import { useAuth } from '../context/AuthContext';

const ITEMS_PER_PAGE = 8;

// Level IDs that require ID Karyawan
const WORKER_LEVEL_IDS = [2, 10]; // worker, worker pcb

const roleVariant = {
  admin: 'primary',
  worker: 'info',
  client: 'default',
  intern: 'warning',
  'admin elprint': 'primary',
  'kasir elprint': 'info',
  'admin elkost': 'primary',
  'client elkost': 'default',
  'worker pcb': 'info',
};

export default function Users() {
  const { user: authUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, user: null, dependents: null });
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // Ref for search input to maintain focus
  const searchInputRef = useRef(null);

  // Synchronous guards: React state alone cannot stop a second click that
  // fires before the re-render, so confirm/delete requests are single-flight.
  const deleteClickInFlightRef = useRef(false);
  const deleteConfirmInFlightRef = useRef(false);

  // Notice helper - must be defined before use in callbacks
  // Use ref to avoid adding to useCallback dependencies
  // noticeTimerRef: notifikasi sebelumnya harus dibatalkan timer-nya, kalau tidak
  // timer lama (5 detik) bisa mematikan notifikasi BARU yang baru muncul.
  const noticeTimerRef = useRef(null);
  const showNoticeRef = useRef(null);
  showNoticeRef.current = (type, message) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  };

  // Debounce search query - 500ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch users from API
  const fetchUsersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await usersService.fetchUsers({
        search: debouncedSearchQuery,
        level: roleFilter,
        page: currentPage,
        perPage: ITEMS_PER_PAGE,
      });
      if (response.status === 'ok') {
        const lastPage = Math.max(1, response.meta.last_page);
        // User terakhir pada halaman terakhir baru saja dihapus: jangan
        // menampilkan halaman kosong - pindah ke halaman terakhir yang masih
        // berisi data (perpindahan ini memicu refetch via useEffect).
        if (response.data.length === 0 && currentPage > lastPage) {
          setCurrentPage(lastPage);
          return;
        }
        setUsers(response.data);
        setTotalPages(response.meta.last_page);
        setTotalItems(response.meta.total);
        if (response.roles) setRoles(response.roles);
      }
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal memuat data user');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchQuery, roleFilter, currentPage]);

  useEffect(() => {
    fetchUsersData();
  }, [fetchUsersData]);

  // Reset filter
  const handleResetFilter = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setRoleFilter('');
    setCurrentPage(1);
    // Focus search input after state updates
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };

  // Delete flow
  const handleDeleteClick = async (user) => {
    // 1. The authenticated user can never delete their own account. Checked
    //    before any request; the backend refuses it too (403 self_delete).
    if (user.is_self || Number(user.id) === Number(authUser?.id)) {
      showNoticeRef.current('error', 'Anda tidak dapat menghapus akun yang sedang digunakan.');
      return;
    }

    // 2. Single-flight: a fast double click must not fire two requests.
    if (deleteBusy || deleteClickInFlightRef.current) return;

    deleteClickInFlightRef.current = true;
    setDeleteBusy(true);
    try {
      const dep = await usersService.fetchUserDependents(user.id);
      setDeleteConfirm({ isOpen: true, user, dependents: dep });
    } catch (err) {
      showNoticeRef.current('error', err.message || 'Gagal memeriksa data terkait.');
    } finally {
      deleteClickInFlightRef.current = false;
      setDeleteBusy(false);
    }
  };

  const handleDeleteCancel = () => {
    if (deleteBusy) return; // sedang proses hapus - jangan tutup di tengah jalan
    setDeleteConfirm({ isOpen: false, user: null, dependents: null });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.user || deleteBusy || deleteConfirmInFlightRef.current) return;

    deleteConfirmInFlightRef.current = true;
    setDeleteBusy(true);
    try {
      const response = await usersService.deleteUser(deleteConfirm.user.id);
      showNoticeRef.current('success', response.message || 'User berhasil dihapus.');
      setDeleteConfirm({ isOpen: false, user: null, dependents: null });
      // Refresh daftar (refetch existing) - baris hilang dari tabel.
      fetchUsersData();
      // Bila sedang mencari, kembalikan fokus ke input search: baris yang baru
      // dihapus terbawa unmount dan fokus bisa jatuh ke body. Value search
      // tidak disentuh (input tidak pernah di-unmount).
      if (searchQuery) searchInputRef.current?.focus();
    } catch (err) {
      // Gagal: tutup dialog supaya error notice terbaca (notice berada di
      // belakang overlay modal), baris TIDAK dihapus dari state, dan user
      // bisa mencoba lagi. Pesan spesifik backend dipakai apa adanya.
      setDeleteConfirm({ isOpen: false, user: null, dependents: null });
      showNoticeRef.current(
        'error',
        err.message || 'Gagal menghapus user. Silakan coba lagi.'
      );
    } finally {
      deleteConfirmInFlightRef.current = false;
      setDeleteBusy(false);
    }
  };

  // Pesan dialog konfirmasi: minimal Nama User + Username, ditambah ringkasan
  // data terkait dari endpoint /dependents bila ada (peringatan CASCADE).
  const deleteConfirmMessage = (() => {
    const target = deleteConfirm.user;
    if (!target) return '';

    let message = `Apakah Anda yakin ingin menghapus user ini?\n\nNama User: ${target.nama}\nUsername: @${target.username}`;

    const blocking = deleteConfirm.dependents?.blocking || [];
    const cascading = deleteConfirm.dependents?.cascading || [];

    if (blocking.length > 0) {
      message += `\n\nMasih ada data terkait yang menahan penghapusan: ${blocking
        .map((d) => `${d.count} data ${d.table}`)
        .join(', ')}. Penghapusan akan ditolak.`;
    } else if (cascading.length > 0) {
      message += `\n\nData terkait yang ikut terhapus otomatis oleh database: ${cascading
        .map((d) => `${d.count} data ${d.table}`)
        .join(', ')}.`;
    }

    return message;
  })();

  // Table columns: USER, ROLE, CREATED, ACTIONS
  // Role badge variant
  const getRoleVariant = (role) => roleVariant[role?.toLowerCase()] || 'default';

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
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
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
          <h2 className="page-title">User Management</h2>
          <p className="page-subtitle">Manage your team members and their permissions</p>
        </div>
        <Link to="/users/create">
          <Button icon={Plus}>
            Add User
          </Button>
        </Link>
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
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
              className="w-36"
              disabled={isLoading}
            >
              <option value="">All Roles</option>
              {roles.map((role) => (
                <option key={role.id_level} value={role.id_level}>
                  {role.nama_level} ({role.users_count})
                </option>
              ))}
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
        ) : users.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No users found"
            description="Try adjusting your search or filter criteria"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-gray-50/50">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">User</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">No HP</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Alamat</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Created</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={user.nama}
                            src={user.foto_url}
                            size="sm"
                          />
                          <div>
                            <p className="text-sm font-medium text-text-primary">{user.nama}</p>
                            <p className="text-xs text-text-muted">@{user.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <Badge variant={getRoleVariant(user.role)}>{user.role}</Badge>
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary max-w-xs truncate">
                        {user.no_hp || '-'}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary max-w-xs truncate">
                        {user.alamat || '-'}
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary">
                        {user.created ? formatDate(user.created) : '-'}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/users/${user.id}/edit`}
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDeleteClick(user)}
                            className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                            disabled={deleteBusy}
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

      {/* Delete Confirmation - komponen modal existing, tanpa desain baru */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Hapus User?"
        message={deleteConfirmMessage}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        loading={deleteBusy}
      />
    </div>
  );
}