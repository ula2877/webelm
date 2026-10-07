import { useEffect, useMemo, useRef, useState } from 'react';
import {
  User as UserIcon,
  IdCard,
  ShieldCheck,
  MapPin,
  Phone,
  Calendar,
  Edit2,
  KeyRound,
  Camera,
  XCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import * as profileService from '../services/profile';

const MAX_PHOTO_KB = 2048;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Nilai kosong / "-" tetap ditampilkan sebagai "-" agar layout tidak berubah
// dan user tidak salah mengira datanya hilang.
function display(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text === '' || text === '-' ? '-' : text;
}

// Format tanggal tanpa konversi timezone agar tidak bergeser sehari.
function formatTanggal(value) {
  const text = display(value);
  if (text === '-') return '-';

  const [year, month, day] = text.slice(0, 10).split('-');
  const monthIndex = Number(month) - 1;

  if (!year || !month || !day || Number.isNaN(monthIndex) || !MONTHS[monthIndex]) {
    return text;
  }

  return `${Number(day)} ${MONTHS[monthIndex]} ${year}`;
}

function fieldErrors(error) {
  return error?.errors || null;
}

function firstFieldError(error, field) {
  const errors = fieldErrors(error);
  const entry = errors?.[field];
  return Array.isArray(entry) ? entry[0] : null;
}

function FieldTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <Icon className="w-5 h-5 text-text-muted shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm font-medium text-text-primary break-words">{value}</p>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, refreshUser, photoUrl } = useAuth();

  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  // Form ubah username + nama. Nilai awal diambil langsung dari user, dan
  // selalu di-refresh di openProfileModal() setiap kali modal dibuka.
  const [profileForm, setProfileForm] = useState(() => ({
    username: user?.username || '',
    nama: user?.nama || '',
  }));
  const [profileErrors, setProfileErrors] = useState({});
  const [profileBusy, setProfileBusy] = useState(false);

  // Form ubah password
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    password: '',
    password_confirmation: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Form ubah foto
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Object URL disimpan di ref agar bisa di-revoke saat diganti atau unmount.
  const photoPreviewRef = useRef(null);

  // Foto profil datang dari AuthContext (user.foto_url dari /api/me) sehingga
  // halaman ini dan avatar di header dijamin memakai foto yang sama.
  const initialsName = user?.nama || user?.username || 'User';

  useEffect(() => {
    return () => {
      if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    };
  }, []);

  function updatePreview(file) {
    if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);

    const url = file ? URL.createObjectURL(file) : null;
    photoPreviewRef.current = url;
    setPhotoPreview(url);
  }

  useEffect(() => {
    return () => clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = (type, message) => {
    clearTimeout(noticeTimer.current);
    setNotice({ type, message });
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  };

  // ---------------------------------------------------------------- profil
  function openProfileModal() {
    setProfileForm({ username: user?.username || '', nama: user?.nama || '' });
    setProfileErrors({});
    setProfileOpen(true);
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileErrors({});

    // Validasi ringan di sisi klien; validasi tetap diulang di server.
    const localErrors = {};
    if (!profileForm.username.trim()) localErrors.username = 'Username wajib diisi.';
    else if (profileForm.username.trim().length < 3) {
      localErrors.username = 'Username minimal 3 karakter.';
    } else if (profileForm.username.trim().length > 50) {
      localErrors.username = 'Username maksimal 50 karakter.';
    } else if (!/^[A-Za-z0-9._-]+$/.test(profileForm.username.trim())) {
      localErrors.username =
        'Username hanya boleh berisi huruf, angka, titik, underscore, atau strip.';
    }

    if (!profileForm.nama.trim()) localErrors.nama = 'Nama wajib diisi.';
    else if (profileForm.nama.trim().length > 500) {
      localErrors.nama = 'Nama maksimal 500 karakter.';
    }

    if (Object.keys(localErrors).length > 0) {
      setProfileErrors(localErrors);
      return;
    }

    setProfileBusy(true);
    try {
      const response = await profileService.updateProfile({
        username: profileForm.username.trim(),
        nama: profileForm.nama.trim(),
      });

      await refreshUser();
      setProfileOpen(false);
      showNotice('success', response.message || 'Profil berhasil diperbarui.');
    } catch (error) {
      setProfileErrors({
        username: firstFieldError(error, 'username'),
        nama: firstFieldError(error, 'nama'),
      });

      if (error.code === 'read_only') {
        setProfileOpen(false);
        showNotice('error', error.message);
      }
    } finally {
      setProfileBusy(false);
    }
  }

  // -------------------------------------------------------------- password
  function openPasswordModal() {
    setPasswordForm({ current_password: '', password: '', password_confirmation: '' });
    setPasswordErrors({});
    setPasswordOpen(true);
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordErrors({});

    const localErrors = {};
    if (!passwordForm.current_password) {
      localErrors.current_password = 'Password lama wajib diisi.';
    }
    if (!passwordForm.password) {
      localErrors.password = 'Password baru wajib diisi.';
    } else if (passwordForm.password.length < 8) {
      localErrors.password = 'Password baru minimal 8 karakter.';
    }
    if (!passwordForm.password_confirmation) {
      localErrors.password_confirmation = 'Konfirmasi password wajib diisi.';
    } else if (passwordForm.password !== passwordForm.password_confirmation) {
      localErrors.password_confirmation =
        'Konfirmasi password tidak sama dengan password baru.';
    }

    if (Object.keys(localErrors).length > 0) {
      setPasswordErrors(localErrors);
      return;
    }

    setPasswordBusy(true);
    try {
      const response = await profileService.changePassword(passwordForm);

      setPasswordOpen(false);
      showNotice('success', response.message || 'Password berhasil diubah.');
    } catch (error) {
      setPasswordErrors({
        current_password: firstFieldError(error, 'current_password'),
        password: firstFieldError(error, 'password'),
        password_confirmation: firstFieldError(error, 'password_confirmation'),
      });

      if (error.code === 'read_only') {
        setPasswordOpen(false);
        showNotice('error', error.message);
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  // ------------------------------------------------------------------ foto
  function openPhotoModal() {
    setPhotoFile(null);
    setPhotoError(null);
    updatePreview(null);
    setPhotoOpen(true);
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    setPhotoError(null);

    if (!file) {
      setPhotoFile(null);
      updatePreview(null);
      return;
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPhotoFile(null);
      event.target.value = '';
      updatePreview(null);
      setPhotoError('Format foto harus JPG, JPEG, PNG, atau WEBP.');
      return;
    }

    if (file.size > MAX_PHOTO_KB * 1024) {
      setPhotoFile(null);
      event.target.value = '';
      updatePreview(null);
      setPhotoError(`Ukuran foto maksimal ${MAX_PHOTO_KB} KB.`);
      return;
    }

    setPhotoFile(file);
    updatePreview(file);
  }

  async function handlePhotoSubmit(event) {
    event.preventDefault();

    if (!photoFile) {
      setPhotoError('Pilih file foto terlebih dahulu.');
      return;
    }

    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const response = await profileService.uploadPhoto(photoFile);

      await refreshUser();
      setPhotoFile(null);
      updatePreview(null);
      setPhotoOpen(false);
      showNotice('success', response.message || 'Foto profil berhasil diperbarui.');
    } catch (error) {
      setPhotoError(firstFieldError(error, 'foto') || error.message);

      if (error.code === 'read_only') {
        setPhotoOpen(false);
        showNotice('error', error.message);
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  const noticeStyle = useMemo(() => {
    if (!notice) return null;

    if (notice.type === 'success') {
      return 'bg-emerald-50 border-emerald-200 text-emerald-800';
    }
    return 'bg-red-50 border-red-200 text-red-800';
  }, [notice]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="page-title">Profile</h2>
        <p className="page-subtitle">View and manage your profile information</p>
      </div>

      {notice && (
        <div
          className={`flex items-start gap-3 p-4 rounded-lg border ${noticeStyle}`}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile card */}
        <Card className="text-center">
          <div className="flex flex-col items-center">
            <div className="relative">
              {/* 128px di mobile, 160px di tablet, 176px di desktop besar.
                  object-fit: cover + rounded-full sudah ditangani Avatar. */}
              <Avatar
                name={initialsName}
                src={photoUrl}
                size="2xl"
                className="md:w-40 md:h-40 lg:w-44 lg:h-44"
              />
              <button
                type="button"
                onClick={openPhotoModal}
                className="absolute -bottom-1 -right-1 w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-md ring-2 ring-white hover:bg-primary-700 transition-colors"
                aria-label="Ubah foto"
                title="Ubah Foto"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>

            <h3 className="mt-4 text-lg font-semibold text-text-primary break-words">
              {display(user.nama)}
            </h3>
            <p className="text-text-secondary break-words">{display(user.username)}</p>
            <div className="mt-3">
              <Badge variant="primary">{display(user.role)}</Badge>
            </div>

            {/* flex-wrap + gap-3 memberi jarak horizontal yang jelas di desktop
                dan otomatis memindahkan tombol ke baris berikutnya di layar
                sempit, tanpa menyebabkan overflow horizontal. */}
            <div className="mt-4 w-full flex flex-wrap items-center justify-center gap-3">
              <Button variant="secondary" size="sm" icon={Edit2} onClick={openProfileModal}>
                Ubah Profil
              </Button>
              <Button variant="secondary" size="sm" icon={KeyRound} onClick={openPasswordModal}>
                Ubah Password
              </Button>
            </div>
          </div>
        </Card>

        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldTile icon={UserIcon} label="Username" value={display(user.username)} />
              <FieldTile icon={IdCard} label="Nama" value={display(user.nama)} />
              <FieldTile icon={ShieldCheck} label="Level" value={display(user.role)} />
              <FieldTile icon={Phone} label="No. HP" value={display(user.no_hp)} />
              <div className="md:col-span-2">
                <FieldTile icon={MapPin} label="Alamat" value={display(user.alamat)} />
              </div>
              <FieldTile
                icon={Calendar}
                label="Tanggal Gabung"
                value={formatTanggal(user.tanggal_gabung)}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Modal ubah username + nama */}
      <Modal isOpen={profileOpen} onClose={() => setProfileOpen(false)} title="Ubah Profil" size="sm">
        <form onSubmit={handleProfileSubmit} className="p-6 space-y-4">
          <Input
            label="Username"
            value={profileForm.username}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
            error={profileErrors.username}
            placeholder="Username"
            autoComplete="username"
            disabled={profileBusy}
          />

          <Input
            label="Nama"
            value={profileForm.nama}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, nama: e.target.value }))}
            error={profileErrors.nama}
            placeholder="Nama lengkap"
            disabled={profileBusy}
          />

          <p className="text-xs text-text-muted">
            Maksimal 50 karakter untuk username dan 500 karakter untuk nama.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setProfileOpen(false)}
              disabled={profileBusy}
            >
              Batal
            </Button>
            <Button type="submit" loading={profileBusy}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal ubah password */}
      <Modal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} title="Ubah Password" size="sm">
        <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
          <Input
            label="Password Lama"
            type="password"
            value={passwordForm.current_password}
            onChange={(e) =>
              setPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))
            }
            error={passwordErrors.current_password}
            placeholder="Masukkan password lama"
            autoComplete="current-password"
            disabled={passwordBusy}
          />

          <Input
            label="Password Baru"
            type="password"
            value={passwordForm.password}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
            error={passwordErrors.password}
            placeholder="Minimal 8 karakter"
            autoComplete="new-password"
            disabled={passwordBusy}
          />

          <Input
            label="Konfirmasi Password Baru"
            type="password"
            value={passwordForm.password_confirmation}
            onChange={(e) =>
              setPasswordForm((prev) => ({ ...prev, password_confirmation: e.target.value }))
            }
            error={passwordErrors.password_confirmation}
            placeholder="Ulangi password baru"
            autoComplete="new-password"
            disabled={passwordBusy}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPasswordOpen(false)}
              disabled={passwordBusy}
            >
              Batal
            </Button>
            <Button type="submit" loading={passwordBusy}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal ubah foto */}
      <Modal isOpen={photoOpen} onClose={() => setPhotoOpen(false)} title="Ubah Foto" size="sm">
        <form onSubmit={handlePhotoSubmit} className="p-6 space-y-4">
          <div className="flex flex-col items-center gap-4">
            <Avatar
              name={initialsName}
              src={photoPreview || photoUrl}
              size="2xl"
            />

            <div className="w-full">
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Pilih Foto
              </label>
              <input
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                onChange={handlePhotoChange}
                disabled={photoBusy}
                className="w-full text-sm text-text-secondary
                  file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                  file:bg-primary-50 file:text-primary-700 file:text-sm
                  file:font-medium hover:file:bg-primary-100
                  border border-border rounded-lg cursor-pointer"
              />
              <p className="mt-1.5 text-xs text-text-muted">
                Format JPG, JPEG, PNG, atau WEBP. Maksimal {MAX_PHOTO_KB} KB.
              </p>
              {photoError && <p className="mt-1.5 text-xs text-error">{photoError}</p>}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPhotoOpen(false)}
              disabled={photoBusy}
            >
              Batal
            </Button>
            <Button type="submit" loading={photoBusy} disabled={!photoFile}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}