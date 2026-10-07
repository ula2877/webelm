import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select, Textarea } from '../components/ui/Input';
import * as usersService from '../services/users';
import WorkerFilePanel from '../components/WorkerFilePanel';
import { useAuth } from '../context/AuthContext';

// Level IDs that require ID Karyawan
const WORKER_LEVEL_IDS = [2, 10]; // worker, worker pcb

export default function EditUser() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();

  // Redirect if not authenticated
  useEffect(() => {
    if (isAuthenticated === false) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  const [formData, setFormData] = useState({
    username: '',
    nama: '',
    id_level: '',
    no_hp: '',
    alamat: '',
    id_karyawan: '',
    password: '',
    password_confirmation: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [levels, setLevels] = useState([]);

  // Fetch levels and user data
  useEffect(() => {
    if (!id) return;
    
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch levels
        const levelsResponse = await usersService.fetchUsers({ perPage: 100 });
        if (levelsResponse.status === 'ok' && levelsResponse.roles) {
          setLevels(levelsResponse.roles);
        }

        // Fetch single user
        const userResponse = await usersService.fetchUserById(id);
        if (userResponse.status === 'ok' && userResponse.data) {
          const user = userResponse.data;
          setFormData({
            username: user.username,
            nama: user.nama,
            id_level: String(user.id_level),
            no_hp: user.no_hp,
            alamat: user.alamat,
            id_karyawan: user.id_karyawan || '',
            password: '',
            password_confirmation: '',
          });
        } else {
          setNotice({ type: 'error', message: 'User tidak ditemukan.' });
        }
      } catch (err) {
        setNotice({ type: 'error', message: err.message || 'Gagal memuat data user' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Determine if ID Karyawan should be shown
  const showIdKaryawan = formData.id_level && WORKER_LEVEL_IDS.includes(Number(formData.id_level));

  // File Worker (upload + daftar file) hanya untuk level worker / worker pcb.
  // Bergantung pada id_level hasil edit, sehingga ketika level berubah ke
  // admin card-nya hilang - tanpa menghapus file di tb_file_worker.
  const showWorkerFiles = showIdKaryawan;

  // Reset form to original data
  const handleCancel = () => {
    navigate('/users');
  };

  // Validation
  const validateForm = () => {
    const errors = {};

    if (!formData.username.trim()) errors.username = 'Username wajib diisi.';
    else if (formData.username.trim().length < 3) errors.username = 'Username minimal 3 karakter.';
    else if (formData.username.trim().length > 50) errors.username = 'Username maksimal 50 karakter.';
    else if (!/^[A-Za-z0-9._-]+$/.test(formData.username.trim())) {
      errors.username = 'Username hanya boleh berisi huruf, angka, titik, underscore, atau strip.';
    }

    if (!formData.nama.trim()) errors.nama = 'Nama wajib diisi.';
    else if (formData.nama.trim().length > 500) errors.nama = 'Nama maksimal 500 karakter.';

    if (!formData.id_level) errors.id_level = 'Level wajib dipilih.';

    if (!formData.no_hp.trim()) errors.no_hp = 'No. HP wajib diisi.';
    else if (formData.no_hp.trim().length > 30) errors.no_hp = 'No. HP maksimal 30 karakter.';

    if (!formData.alamat.trim()) errors.alamat = 'Alamat wajib diisi.';

    if (showIdKaryawan) {
      if (!formData.id_karyawan.trim()) errors.id_karyawan = 'ID Karyawan wajib diisi untuk Worker / Worker PCB.';
      else if (formData.id_karyawan.trim().length > 100) errors.id_karyawan = 'ID Karyawan maksimal 100 karakter.';
    }

    // Password validation only if user entered something
    if (formData.password || formData.password_confirmation) {
      if (formData.password.length < 8) errors.password = 'Password minimal 8 karakter.';
      if (formData.password !== formData.password_confirmation) {
        errors.password_confirmation = 'Konfirmasi password tidak sama dengan password baru.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      const payload = {
        username: formData.username.trim(),
        nama: formData.nama.trim(),
        id_level: Number(formData.id_level),
        no_hp: formData.no_hp.trim(),
        alamat: formData.alamat.trim(),
      };

      // Only include id_karyawan for worker/worker pcb
      if (showIdKaryawan) {
        payload.id_karyawan = formData.id_karyawan.trim();
      }

      // Only include password if user wants to change it
      if (formData.password) {
        payload.password = formData.password;
        payload.password_confirmation = formData.password_confirmation;
      }

      const response = await usersService.updateUser(Number(id), payload);
      setNotice({ type: 'success', message: response.message || 'User berhasil diperbarui.' });

      // Redirect to /users after short delay
      setTimeout(() => {
        navigate('/users');
      }, 1500);
    } catch (err) {
      if (err.errors) {
        const mapped = {};
        Object.keys(err.errors).forEach((key) => {
          mapped[key] = Array.isArray(err.errors[key]) ? err.errors[key][0] : err.errors[key];
        });
        setFormErrors(mapped);
      }
      setNotice({ type: 'error', message: err.message || 'Gagal memperbarui user.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Level change handler - reset id_karyawan when level changes
  const handleLevelChange = (levelId) => {
    setFormData((prev) => ({
      ...prev,
      id_level: levelId,
      // Reset id_karyawan when level changes
      id_karyawan: '',
    }));
    if (formErrors.id_karyawan) {
      setFormErrors((prev) => ({ ...prev, id_karyawan: null }));
    }
  };

  // Generic input handler
  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back link */}
      <div>
        <Link
          to="/users"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-primary-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke User Management
        </Link>
      </div>

      {/* Header */}
      <div>
        <h2 className="page-title">Edit User</h2>
        <p className="page-subtitle">Edit user information</p>
      </div>

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
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
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
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Form (kiri 50%) + File Worker (kanan 50%, hanya worker/worker pcb) */}
      <div
        className={
          showWorkerFiles
            ? 'w-full flex flex-col lg:flex-row gap-6'
            : 'w-full md:w-3/4 lg:w-1/2'
        }
      >
        <div className={showWorkerFiles ? 'w-full lg:w-1/2 min-w-0' : undefined}>
          <Card>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Level - First field */}
              <Select
                label="Level"
                value={formData.id_level}
                onChange={(e) => handleLevelChange(e.target.value)}
                error={formErrors.id_level}
              >
                <option value="">Pilih Level</option>
                {levels.map((level) => (
                  <option key={level.id_level} value={level.id_level}>
                    {level.nama_level}
                  </option>
                ))}
              </Select>

              {/* Conditional ID Karyawan - shown for worker/worker pcb */}
              {showIdKaryawan && (
                <Input
                  label="ID Karyawan"
                  placeholder="Masukkan ID Karyawan"
                  value={formData.id_karyawan}
                  onChange={handleChange('id_karyawan')}
                  error={formErrors.id_karyawan}
                />
              )}

              {/* Username & Nama - 2 columns on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="Username"
                  placeholder="Username"
                  value={formData.username}
                  onChange={handleChange('username')}
                  error={formErrors.username}
                  autoComplete="username"
                />
                <Input
                  label="Nama User"
                  placeholder="Nama lengkap"
                  value={formData.nama}
                  onChange={handleChange('nama')}
                  error={formErrors.nama}
                />
              </div>

              {/* No HP & (empty for alignment) - 2 columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="No HP (WA)"
                  placeholder="Nomor HP/WA (08xxxxxxxxxx)"
                  value={formData.no_hp}
                  onChange={handleChange('no_hp')}
                  error={formErrors.no_hp}
                />
                {/* Empty div for layout alignment when ID Karyawan is not shown */}
                {!showIdKaryawan && <div />}
              </div>

              {/* Alamat - Full width */}
              <Textarea
                label="Alamat"
                placeholder="Alamat lengkap"
                value={formData.alamat}
                onChange={handleChange('alamat')}
                error={formErrors.alamat}
                rows={3}
              />

              {/* Password & Konfirmasi - 2 columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  type="password"
                  label="Password Baru"
                  placeholder="Kosongkan jika tidak ingin mengubah password"
                  value={formData.password}
                  onChange={handleChange('password')}
                  error={formErrors.password}
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  label="Konfirmasi Password Baru"
                  placeholder="Ulangi password baru"
                  value={formData.password_confirmation}
                  onChange={handleChange('password_confirmation')}
                  error={formErrors.password_confirmation}
                  autoComplete="new-password"
                />
              </div>

              <p className="text-xs text-text-muted">
                Kosongkan password jika tidak ingin mengubah password.
              </p>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Batal
                </Button>
                <Button type="submit" loading={isSubmitting} className="flex-1">
                  Simpan Perubahan
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Kanan: Card Upload File Worker + Card File Worker */}
        {showWorkerFiles && (
          <div className="w-full lg:w-1/2 min-w-0 space-y-6">
            <WorkerFilePanel userId={id} />
          </div>
        )}
      </div>
    </div>
  );
}