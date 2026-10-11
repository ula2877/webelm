import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../utils/roles';

/**
 * Guard untuk route khusus admin (User Management & Surat-menyurat).
 *
 * Jika user login tetapi bukan admin (mis. worker), dialihkan ke /dashboard.
 * Ini HANYA lapisan UX: penolakan sebenarnya ada di backend lewat middleware
 * 'admin' (HTTP 403), sehingga tetap aman walau URL dibuka langsung.
 *
 * Dipasang sebagai parent route (layout route) sehingga seluruh sub-route
 * (create, edit, view, preview, dsb.) otomatis ikut terlindungi.
 */
export default function AdminRoute() {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Parent ProtectedRoute sudah menangani loading/unauth saat refresh, tetapi
  // dijaga di sini juga agar komponen tetap benar bila dipakai terpisah.
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin(user)) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
