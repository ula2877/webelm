import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  Wallet,
  X,
} from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import Input, { Select } from './ui/Input';
import Badge from './ui/Badge';
import * as projectService from '../services/projects';

// Jenis transaksi mengikuti ENUM tb_pembayaran apa adanya (dp/lunas).
const PAYMENT_TYPES = [
  { value: 'dp', label: 'DP' },
  { value: 'lunas', label: 'Lunas' },
];

const ACCEPT_ATTR = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];
const MAX_BUKTI_BYTES = 4 * 1024 * 1024; // 4 MB

/** Format angka sebagai Rupiah Indonesia: 15000000 -> "Rp 15.000.000". */
function formatRupiah(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'Rp 0';
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.trunc(n));
}

/** Tampilkan digit sebagai "1.000.000" saat diketik; nilai state tetap digit. */
function formatNominalDisplay(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  return new Intl.NumberFormat('id-ID').format(Number(digits));
}

/** Ambil pesan pertama dari errors Laravel (bisa berupa array) per field. */
function firstMessage(value) {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

/**
 * Card Manajemen Pembayaran di halaman Edit Projek.
 *
 * Semua angka (harga, total, sisa) berasal dari backend (tb_pembayaran +
 * tb_project.harga), bukan state lokal. Setelah menyimpan, ringkasan diperbarui
 * dari respons backend tanpa memuat ulang seluruh halaman.
 */
export default function ProjectPaymentManager({ uuid }) {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Modal tambah pembayaran.
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [jenis, setJenis] = useState('dp');
  const [nominal, setNominal] = useState(''); // digit saja
  const [bukti, setBukti] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Hapus transaksi pembayaran (konfirmasi + single-flight).
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const savingRef = useRef(false);
  const deletingRef = useRef(false);
  const fileInputRef = useRef(null);

  const loadSummary = () => {
    setLoadError(null);
    setIsLoading(true);
    return projectService
      .fetchProjectPayments(uuid)
      .then((res) => {
        if (res?.status !== 'ok' || !res.data) {
          setLoadError('Data pembayaran tidak ditemukan.');
          return;
        }
        setSummary(res.data);
      })
      .catch((err) => {
        setLoadError(err.message || 'Gagal memuat data pembayaran.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  // Muat ringkasan pembayaran saat halaman edit dibuka / UUID berubah.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setIsLoading(true);
    setSummary(null);
    projectService
      .fetchProjectPayments(uuid)
      .then((res) => {
        if (cancelled) return;
        if (res?.status !== 'ok' || !res.data) {
          setLoadError('Data pembayaran tidak ditemukan.');
          return;
        }
        setSummary(res.data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Gagal memuat data pembayaran.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uuid]);

  const harga = Number(summary?.harga ?? 0);
  const total = Number(summary?.total_pembayaran ?? 0);
  const sisa = Number.isFinite(Number(summary?.sisa))
    ? Number(summary.sisa)
    : Math.max(0, harga - total);
  const kelebihan = Number.isFinite(Number(summary?.kelebihan))
    ? Number(summary.kelebihan)
    : Math.max(0, total - harga);
  const history = Array.isArray(summary?.pembayaran) ? summary.pembayaran : [];

  const resetForm = () => {
    setJenis('dp');
    setNominal('');
    setBukti(null);
    setFieldErrors({});
    setSubmitError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (savingRef.current) return;
    setIsModalOpen(false);
  };

  const handleFile = (file) => {
    if (!file) {
      setBukti(null);
      return;
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setBukti(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFieldErrors((prev) => ({
        ...prev,
        bukti: 'Format bukti harus JPG, JPEG, PNG, atau PDF.',
      }));
      return;
    }

    if (file.size > MAX_BUKTI_BYTES) {
      setBukti(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFieldErrors((prev) => ({
        ...prev,
        bukti: 'Ukuran bukti maksimal 4 MB.',
      }));
      return;
    }

    setFieldErrors((prev) => ({ ...prev, bukti: '' }));
    setBukti(file);
  };

  const clearFile = () => {
    setBukti(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFieldErrors((prev) => ({ ...prev, bukti: '' }));
  };

  const validateForm = () => {
    const errors = {};
    const nominalNum = Number(nominal);

    if (!nominal || !(nominalNum > 0)) {
      errors.nominal = 'Nominal wajib diisi dan lebih besar dari nol.';
    } else if (jenis === 'lunas' && nominalNum !== sisa) {
      errors.nominal =
        nominalNum > sisa
          ? `Nominal Lunas tidak boleh melebihi sisa biaya (${formatRupiah(sisa)}).`
          : `Nominal Lunas harus sama dengan sisa biaya (${formatRupiah(sisa)}).`;
    }

    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;

    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSubmitError('');
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setSubmitError('');

    try {
      const res = await projectService.saveProjectPayment(uuid, {
        pelunasan: jenis,
        nominal: Number(nominal),
        bukti: bukti || undefined,
      });

      if (res?.status !== 'ok' || !res.data) {
        throw new Error(res?.message || 'Gagal menyimpan pembayaran.');
      }

      // Perbarui ringkasan dari data terbaru backend tanpa reload halaman.
      setSummary(res.data);
      setIsModalOpen(false);
      resetForm();
      setNotice({
        type: 'success',
        message: res.message || 'Pembayaran berhasil disimpan.',
      });
    } catch (err) {
      // Modal tetap terbuka & input tidak hilang supaya bisa diperbaiki.
      if (err?.errors) {
        setFieldErrors((prev) => ({
          ...prev,
          pelunasan: firstMessage(err.errors.pelunasan) || prev.pelunasan || '',
          nominal: firstMessage(err.errors.nominal) || prev.nominal || '',
          bukti: firstMessage(err.errors.bukti) || prev.bukti || '',
        }));
      }
      setSubmitError(err.message || 'Gagal menyimpan pembayaran.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // Konfirmasi hapus SATU transaksi. UI tidak diubah sebelum backend sukses.
  const handleDelete = async () => {
    if (!confirmTarget || deletingRef.current) return;

    deletingRef.current = true;
    setIsDeleting(true);
    try {
      const res = await projectService.deleteProjectPayment(uuid, confirmTarget.id);

      if (res?.status !== 'ok') {
        throw new Error(res?.message || 'Gagal menghapus pembayaran.');
      }

      // Backend mengembalikan ringkasan terbaru (total & sisa sudah dihitung
      // ulang); fallback ke reload bila tidak ada.
      if (res?.data?.summary) {
        setSummary(res.data.summary);
      } else {
        await loadSummary();
      }

      setConfirmTarget(null);

      const fileFailed = Boolean(res?.data?.file_failed);
      setNotice({
        type: fileFailed ? 'error' : 'success',
        // Kegagalan cleanup file tidak boleh dilaporkan sebagai sukses penuh,
        // jadi peringatannya dipastikan tampil apa pun pesan dari server.
        message: fileFailed
          ? 'Pembayaran dihapus, tetapi file bukti gagal dibersihkan dari storage.'
          : res?.message || 'Pembayaran berhasil dihapus.',
      });
    } catch (err) {
      // Gagal: JANGAN hapus item dari UI, tampilkan pesan error.
      setNotice({
        type: 'error',
        message: err.message || 'Gagal menghapus pembayaran.',
      });
      setConfirmTarget(null);
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <Card className="lg:sticky lg:top-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-primary-600" />
        </span>
        <h3 className="text-lg font-semibold text-text-primary">
          Manajemen Pembayaran
        </h3>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-red-50 border-red-200 text-red-800">
          <p className="text-sm flex-1">{loadError}</p>
          <button
            type="button"
            onClick={loadSummary}
            className="shrink-0 text-sm font-medium underline hover:no-underline"
          >
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          {notice && (
            <div
              className={`flex items-start gap-2 p-3 mb-4 rounded-lg border ${
                notice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
              role="status"
            >
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <p className="text-sm flex-1">{notice.message}</p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Tutup notifikasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Ringkasan keuangan (semua dari backend). */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">Harga Total</span>
              <span className="text-sm font-semibold text-text-primary tabular-nums">
                {formatRupiah(harga)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">Total Pembayaran</span>
              <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                {formatRupiah(total)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
              <span className="text-sm font-medium text-text-primary">Sisa Biaya</span>
              <span className="text-base font-bold text-primary-600 tabular-nums">
                {formatRupiah(sisa)}
              </span>
            </div>
            {kelebihan > 0 && (
              <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-amber-50 border border-amber-200">
                <span className="text-xs font-medium text-amber-800">
                  Kelebihan Pembayaran
                </span>
                <span className="text-xs font-bold text-amber-800 tabular-nums">
                  {formatRupiah(kelebihan)}
                </span>
              </div>
            )}
          </div>

          <Button type="button" onClick={openModal} className="w-full mt-5">
            <Plus className="w-4 h-4" />
            Tambah Pembayaran
          </Button>

          {/* Riwayat pembayaran (terbaru lebih dulu). */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-text-primary mb-3">
              Riwayat Pembayaran
            </h4>

            {history.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-6">
                Belum ada pembayaran untuk projek ini
              </p>
            ) : (
              <ul className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {history.map((item) => (
                  <li
                    key={item.id}
                    className="p-3 rounded-lg border border-border bg-gray-50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-text-primary tabular-nums">
                        {formatRupiah(item.nominal)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge variant={item.pelunasan === 'lunas' ? 'success' : 'warning'}>
                          {item.pelunasan === 'lunas' ? 'Lunas' : 'DP'}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => setConfirmTarget(item)}
                          disabled={isDeleting}
                          title="Hapus pembayaran"
                          aria-label="Hapus pembayaran"
                          className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      {item.bukti_url ? (
                        <a
                          href={item.bukti_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Lihat Bukti Transfer
                        </a>
                      ) : (
                        <span className="text-xs text-text-muted">
                          Tanpa bukti transfer
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!summary?.has_transaction_date && (
              <p className="mt-3 text-xs text-text-muted">
                Tanggal transaksi belum tersimpan pada data pembayaran.
              </p>
            )}
          </div>
        </>
      )}

      {/* Modal Tambah Pembayaran */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Tambah Pembayaran"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="payment-form"
              loading={isSaving}
              disabled={isSaving}
            >
              Simpan Pembayaran
            </Button>
          </div>
        }
      >
        <form id="payment-form" onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Jenis Pembayaran"
            value={jenis}
            onChange={(e) => {
              setJenis(e.target.value);
              setFieldErrors((prev) => ({ ...prev, nominal: '' }));
            }}
            error={fieldErrors.pelunasan}
            disabled={isSaving}
          >
            {PAYMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>

          <div>
            <Input
              label="Nominal"
              inputMode="numeric"
              value={formatNominalDisplay(nominal)}
              onChange={(e) =>
                setNominal(String(e.target.value).replace(/\D/g, '').slice(0, 15))
              }
              error={fieldErrors.nominal}
              placeholder="Rp 0"
              disabled={isSaving}
            />
            {jenis === 'lunas' && (
              <p className="mt-1.5 text-xs text-text-muted">
                Sisa biaya saat ini: {formatRupiah(sisa)}. Nominal Lunas harus
                sama dengan sisa biaya.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Bukti Transfer (opsional)
            </label>
            <div
              role="button"
              tabIndex={0}
              aria-label="Pilih file bukti transfer"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (fileInputRef.current) fileInputRef.current.click();
                }
              }}
              className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors border-border bg-gray-50 hover:border-primary-300 hover:bg-primary-50/60 ${
                isSaving ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              <UploadCloud className="w-6 h-6 mx-auto mb-1.5 text-text-muted" />
              {bukti ? (
                <p className="text-sm text-text-primary font-medium break-all">
                  {bukti.name}
                </p>
              ) : (
                <p className="text-sm text-text-primary font-medium">
                  Klik untuk memilih file
                </p>
              )}
              <p className="text-xs text-text-muted mt-0.5">
                JPG, JPEG, PNG, PDF - maks 4 MB
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
              className="hidden"
              disabled={isSaving}
            />

            {bukti && (
              <button
                type="button"
                onClick={clearFile}
                disabled={isSaving}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                Hapus file bukti
              </button>
            )}

            {fieldErrors.bukti && (
              <p className="mt-1.5 text-xs text-error" role="alert">
                {fieldErrors.bukti}
              </p>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-error" role="alert">
              {submitError}
            </p>
          )}
        </form>
      </Modal>

      {/* Konfirmasi hapus pembayaran (transaksi + file bukti). */}
      <ConfirmDialog
        isOpen={Boolean(confirmTarget)}
        onClose={() => {
          if (!isDeleting) setConfirmTarget(null);
        }}
        onConfirm={handleDelete}
        title="Hapus Pembayaran?"
        message="Data transaksi pembayaran dan file bukti transfer yang terkait akan dihapus secara permanen. Apakah kamu yakin ingin melanjutkan?"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        loading={isDeleting}
      />
    </Card>
  );
}
