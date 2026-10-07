import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileDown,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Textarea, Select } from '../components/ui/Input';
import SuratJenisPreview from '../components/SuratJenisPreview';
import { buildPreviewHtml } from '../utils/quotationPrintHtml';
import { cn } from '../utils/helpers';
import * as suratService from '../services/surat';
import {
  buildSuratJenisPayload,
  buildSuratJenisTotals,
  computeItemSubtotal,
  createInitialSuratJenisForm,
  emptyItem,
  formFromSuratJenisDetail,
  rupiah,
  suratJenisConfig,
  validateImageFile,
  validateSuratJenis,
} from '../utils/suratJenis';
import SuratJalanPreview from '../components/SuratJalanPreview';
import {
  ImageAssetField,
  Section,
  Toggle,
  ZoomControls,
} from './CreateSuratQuotation';

// Live Preview zoom levels (percent). Default is "Fit to width".
const ZOOM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 125, 150];
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

// Satuan yang valid untuk item surat (pola Surat Penawaran).
const SATUAN_OPTIONS = ['PCS', 'Paket', 'OH', 'LS'];

// Halaman Create/Edit untuk surat generik (Surat Jalan,
// BAST, Surat Permohonan Pemeriksaan/Pembayaran, Kuitansi).
// Pola identik dengan CreateSuratPenawaran: form kiri,
// Live Preview A4 kanan, Simpan & Download PDF.
export default function CreateSuratJenis({ jenisKey }) {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);
  const cfg = suratJenisConfig(jenisKey);
  const [isLoadingDetail, setIsLoadingDetail] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ ...createInitialSuratJenisForm(), sumberQuotationId: null });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Hasil save terakhir (id/uuid dari backend).
  const [savedSurat, setSavedSurat] = useState(null);
  // ID asset (tb_surat_asset) untuk tanda tangan.
  // null = tidak pakai / belum dipilih. Hanya ID-nya
  // yang dikirim ke backend (id_asset_ttd).
  const [assetIds, setAssetIds] = useState({ signature: null });

  // ---- Surat Jalan: daftar Surat Penawaran untuk "Ambil dari Surat Penawaran" ----
  const isDeliveryNote = jenisKey === 'delivery-note';
  const [quotations, setQuotations] = useState([]);
  const [quotationsLoading, setQuotationsLoading] = useState(false);

  useEffect(() => {
    if (!isDeliveryNote) return undefined;
    let cancelled = false;
    setQuotationsLoading(true);
    suratService
      .fetchSurat({ search: '', jenis: 'quotation', page: 1, perPage: 100 })
      .then((res) => {
        if (!cancelled && res?.status === 'ok') {
          setQuotations(res.data || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setQuotationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDeliveryNote]);

  const handleSourceQuotationChange = async (id) => {
    setField('sumberQuotationId', id ? Number(id) : null);
    if (!id) return;
    try {
      const res = await suratService.fetchQuotationDetail(id);
      if (res?.status === 'ok' && res.data) {
        const d = res.data.data || {};
        setForm((prev) => ({
          ...prev,
          sumberQuotationId: Number(id),
          nomorPenawaran: res.data.nomor || '',
          customerName: d.customerName || '',
          customerAddress: d.customerAddress || '',
          items: Array.isArray(res.data.items) && res.data.items.length
            ? res.data.items.map((it) => ({
                id: `item-${Math.random().toString(36).slice(2, 9)}`,
                nama_komponen: it.nama_komponen ?? '',
                spesifikasi: Array.isArray(it.spesifikasi) ? it.spesifikasi.join('\n') : '',
                volume: it.volume ?? '',
                satuan: it.satuan ?? '',
                harga_satuan: it.harga_satuan ?? '',
              }))
            : prev.items,
        }));
      }
    } catch (err) {
      showNotice('error', err.message || 'Gagal memuat data Surat Penawaran.');
    }
  };

  // ---- Live preview zoom (fit-to-width by default) ----
  const previewViewportRef = useRef(null);
  const [zoom, setZoom] = useState(100);
  const [isFit, setIsFit] = useState(true);
  const [fitPercent, setFitPercent] = useState(100);

  // Compute the zoom % that makes the whole A4 width fit the preview viewport.
  const measureFit = useCallback(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;
    const styles = window.getComputedStyle(viewport);
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const available = viewport.clientWidth - padX;
    if (!available) return;
    const a4WidthPx = (210 * 96) / 25.4; // 210mm -> ~793.7px
    const percent = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.floor((available / a4WidthPx) * 100)));
    setFitPercent(percent);
  }, []);

  useEffect(() => {
    if (!isFit) return undefined;
    const raf = requestAnimationFrame(measureFit);
    const viewport = previewViewportRef.current;
    let observer;
    if (viewport && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measureFit);
      observer.observe(viewport);
    }
    window.addEventListener('resize', measureFit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measureFit);
      if (observer) observer.disconnect();
    };
  }, [isFit, measureFit]);

  const effectiveZoom = isFit ? fitPercent : zoom;
  const scale = effectiveZoom / 100;
  const canZoomIn = !isFit && zoom < ZOOM_MAX;
  const canZoomOut = !isFit && zoom > ZOOM_MIN;

  const zoomIn = () => {
    if (isFit) {
      const next = ZOOM_LEVELS.find((l) => l >= fitPercent) ?? ZOOM_MAX;
      setZoom(next);
      setIsFit(false);
      return;
    }
    setZoom((z) => ZOOM_LEVELS.find((l) => l > z) ?? ZOOM_MAX);
  };
  const zoomOut = () => {
    if (isFit) {
      const lower = ZOOM_LEVELS.filter((l) => l < fitPercent);
      setZoom(lower.length ? lower[lower.length - 1] : ZOOM_MIN);
      setIsFit(false);
      return;
    }
    setZoom((z) => {
      const lower = ZOOM_LEVELS.filter((l) => l < z);
      return lower.length ? lower[lower.length - 1] : ZOOM_MIN;
    });
  };
  const fitToWidth = () => {
    setIsFit(true);
    measureFit();
  };

  const totals = useMemo(
    () => buildSuratJenisTotals(form.items),
    [form.items]
  );

  const showNotice = useCallback((type, message) => {
    setNotice({ type, message });
  }, []);

  const setField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Tanggal dipilih user -> nomor surat otomatis mengikuti tanggal
  // (dihitung oleh backend dari data aktif tb_surat).
  const handleTanggalChange = (value) => {
    setForm((prev) => ({ ...prev, tanggal: value }));
  };

  // Generate nomor otomatis setiap tanggal berubah (termasuk saat pertama
  // dibuka). HANYA di mode create - mode edit memakai nomor tersimpan.
  useEffect(() => {
    if (isEditMode) return undefined;
    let cancelled = false;
    if (!form.tanggal) {
      setField('nomor', '');
      return undefined;
    }
    suratService
      .fetchNextSuratJenisNumber(jenisKey, form.tanggal)
      .then((res) => {
        if (!cancelled && res?.status === 'ok') {
          setForm((prev) => ({ ...prev, nomor: res.data.nomor }));
        }
      })
      .catch(() => {
        if (!cancelled) setForm((prev) => ({ ...prev, nomor: '' }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tanggal, isEditMode, jenisKey]);

  // ---- Mode EDIT: muat data surat tersimpan ke form ----
  useEffect(() => {
    if (!isEditMode) return undefined;
    let cancelled = false;
    setIsLoadingDetail(true);
    setLoadError(null);
    suratService
      .fetchQuotationDetail(editId)
      .then((res) => {
        if (cancelled) return;
        if (res?.status !== 'ok' || !res.data || res.data.jenis !== jenisKey) {
          setLoadError('Surat tidak ditemukan.');
          return;
        }
        const s = res.data;
        setAssetIds({ signature: s.id_asset_ttd ?? null });
        setForm((prev) => ({ ...prev, ...formFromSuratJenisDetail(s) }));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Gagal memuat data surat.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditMode, editId, jenisKey]);

  // ------------------------------------------------- signature images
  // Files are uploaded to the server (recorded in tb_surat_asset). The stored
  // absolute URL is kept in the form state and shown in the Live Preview.
  const [imageErrors, setImageErrors] = useState({});
  const [assets, setAssets] = useState({ signature: [] });
  const [assetsLoading, setAssetsLoading] = useState({ signature: false });
  const [uploading, setUploading] = useState({ signature: false });

  const loadAssets = useCallback(async () => {
    setAssetsLoading((prev) => ({ ...prev, signature: true }));
    try {
      const res = await suratService.fetchSuratAssets('signature');
      if (res.status === 'ok') {
        setAssets((prev) => ({ ...prev, signature: res.data || [] }));
      }
    } catch (err) {
      showNotice('error', err.message || 'Gagal memuat asset sebelumnya.');
    } finally {
      setAssetsLoading((prev) => ({ ...prev, signature: false }));
    }
  }, [showNotice]);

  // Load the previously stored signature list once on mount.
  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const handleUploadAsset = useCallback(
    async (file) => {
      const err = validateImageFile(file);
      if (err) {
        setImageErrors((prev) => ({ ...prev, signature: err }));
        return;
      }
      setImageErrors((prev) => ({ ...prev, signature: null }));
      setUploading((prev) => ({ ...prev, signature: true }));
      try {
        const res = await suratService.uploadSuratAsset('signature', file);
        if (res.status === 'ok' && res.data?.url) {
          setForm((prev) => ({ ...prev, signatureImage: res.data.url }));
          // Simpan ID asset-nya (bukan URL) untuk dikirim ke backend.
          setAssetIds((prev) => ({ ...prev, signature: res.data.id ?? null }));
          // Refresh the "file sebelumnya" list so the new asset appears there.
          loadAssets();
        } else {
          setImageErrors((prev) => ({ ...prev, signature: 'Gagal mengunggah file.' }));
        }
      } catch (uploadErr) {
        setImageErrors((prev) => ({
          ...prev,
          signature: uploadErr.message || 'Gagal mengunggah file.',
        }));
      } finally {
        setUploading((prev) => ({ ...prev, signature: false }));
      }
    },
    [loadAssets]
  );

  const handleSelectAsset = useCallback((url, assetId) => {
    setForm((prev) => ({ ...prev, signatureImage: url }));
    // Pilih asset existing = pakai ID asset yang sudah ada di tb_surat_asset.
    setAssetIds((prev) => ({ ...prev, signature: assetId ?? null }));
  }, []);

  // Assets are chosen by URL; "Hapus" only detaches it from this form. The
  // stored record in tb_surat_asset is never deleted (reusable on other letters).
  const handleImageRemove = useCallback(() => {
    setForm((prev) => ({ ...prev, signatureImage: null }));
    setAssetIds((prev) => ({ ...prev, signature: null }));
  }, []);

  // ---------------------------------------------------------------- items
  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));

  const removeItem = (index) =>
    setForm((prev) => {
      const items = prev.items.filter((_, i) => i !== index);
      return { ...prev, items: items.length ? items : [emptyItem()] };
    });

  const updateItem = (index, field, value) =>
    setForm((prev) => {
      const items = prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item));
      return { ...prev, items };
    });

  const moveItem = (index, direction) =>
    setForm((prev) => {
      const items = [...prev.items];
      const target = index + direction;
      if (target < 0 || target >= items.length) return prev;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...prev, items };
    });

  // ---------------------------------------------------------------- notes
  const addNote = () => setForm((prev) => ({ ...prev, notes: [...prev.notes, ''] }));
  const removeNote = (index) =>
    setForm((prev) => ({
      ...prev,
      notes: prev.notes.length > 1 ? prev.notes.filter((_, i) => i !== index) : [''],
    }));
  const updateNote = (index, value) =>
    setForm((prev) => ({
      ...prev,
      notes: prev.notes.map((note, i) => (i === index ? value : note)),
    }));

  // ---------------------------------------------------------------- actions
  // Validasi dulu (frontend), lalu backend memvalidasi ulang.
  const validateForm = () => {
    const { valid, errors: validationErrors } = validateSuratJenis(form, isDeliveryNote);
    setErrors(validationErrors);
    if (!valid) {
      showNotice('error', 'Lengkapi field wajib sebelum menyimpan surat.');
      return false;
    }
    return true;
  };

  // SIMPAN & DOWNLOAD PDF: validasi -> simpan -> generate PDF -> download.
  const handleSaveAndDownload = async () => {
    if (isSubmitting || !validateForm()) return;
    setIsSubmitting(true);
    try {
      const payload = buildSuratJenisPayload(form, assetIds);
      // CREATE -> INSERT baru, EDIT -> UPDATE record yang sama.
      const res = isEditMode
        ? await suratService.updateSuratJenis(editId, jenisKey, payload)
        : await suratService.saveSuratJenis(jenisKey, payload);
      if (res.status !== 'ok' || (!isEditMode && !res.data?.id)) {
        showNotice('error', res.message || 'Gagal menyimpan surat. Silakan coba lagi.');
        return;
      }
      setSavedSurat(res.data);

      // Baru setelah data tersimpan: generate + download PDF.
      // PDF dirender dari HTML Live Preview (Chrome headless backend)
      // sehingga hasilnya identik dengan preview di layar.
      const previewHtml = await buildPreviewHtml();
      const blob = await suratService.downloadQuotationPdfFromHtml(previewHtml);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cfg.pdfPrefix}-${String(res.data.nomor || form.nomor || 'surat').replace(
        /[\\/:*?"<>|]+/g,
        '_'
      )}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showNotice('success', isEditMode ? 'Surat diperbarui dan PDF berhasil diunduh.' : 'Surat tersimpan dan PDF berhasil diunduh.');
    } catch (err) {
      showNotice('error', err.message || 'Gagal menyimpan surat / mengunduh PDF. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(`/${cfg.routeBase}`)}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">
              {isEditMode ? `Edit ${cfg.label}` : `Buat ${cfg.label}`}
            </h2>
            <p className="page-subtitle">
              {isEditMode
                ? `Ubah ${cfg.label.toLowerCase()} dengan live preview`
                : `Susun ${cfg.label.toLowerCase()} dengan live preview`}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            icon={FileDown}
            onClick={handleSaveAndDownload}
            loading={isSubmitting}
            className="whitespace-nowrap"
          >
            Simpan &amp; Download PDF
          </Button>
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div
          className={cn(
            'flex items-start gap-3 p-4 rounded-lg border',
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}
          role="status"
        >
          <p className="text-sm flex-1">{notice.message}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity text-sm"
            aria-label="Tutup notifikasi"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading / error state untuk mode edit */}
      {isEditMode && isLoadingDetail && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      )}
      {isEditMode && loadError && (
        <div className="flex items-start gap-3 p-4 rounded-lg border bg-red-50 border-red-200 text-red-800" role="alert">
          <p className="text-sm flex-1">{loadError}</p>
        </div>
      )}

      {(!isEditMode || (!isLoadingDetail && !loadError)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ---------------------------------------------------------- FORM */}
          <div className="lg:col-span-1 min-w-0 space-y-6">
            {/* 0. Informasi Sumber (khusus Surat Jalan) */}
            {isDeliveryNote && (
              <Section title="Informasi Sumber Surat Jalan">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">
                      Ambil dari Surat Penawaran
                    </label>
                    <select
                      value={form.sumberQuotationId || ''}
                      onChange={(e) => handleSourceQuotationChange(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">-- Pilih Surat Penawaran --</option>
                      {quotationsLoading ? (
                        <option disabled>Memuat...</option>
                      ) : (
                        quotations.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.nomor} — {q.pengirim || '-'}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <Input
                    label="Nomor Penawaran"
                    value={form.nomorPenawaran}
                    onChange={(e) => setField('nomorPenawaran', e.target.value)}
                    placeholder="Nomor surat penawaran (otomatis jika dipilih)"
                  />
                  <Input
                    label="Nomor PO/SPK"
                    value={form.nomorPO}
                    onChange={(e) => setField('nomorPO', e.target.value)}
                    placeholder="Masukkan nomor PO/SPK"
                  />
                </div>
              </Section>
            )}

            {/* 1. Informasi Surat */}
            <Section title="Informasi Surat">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nomor Surat"
                  value={form.nomor}
                  onChange={(e) => setField('nomor', e.target.value)}
                  error={errors.nomor}
                  placeholder="Nomor surat akan dibuat otomatis"
                  readOnly
                />
                <Input
                  label="Tanggal Surat"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => handleTanggalChange(e.target.value)}
                  error={errors.tanggal}
                />
                <Input
                  label="Kota"
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                  placeholder="Masukkan kota"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Perihal"
                    value={form.subject}
                    onChange={(e) => setField('subject', e.target.value)}
                    error={errors.subject}
                    placeholder="Masukkan perihal surat"
                  />
                </div>
              </div>
            </Section>

            {/* 2. Informasi Penerima */}
            <Section title="Informasi Penerima">
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Nama Instansi / Perusahaan"
                  value={form.customerName}
                  onChange={(e) => setField('customerName', e.target.value)}
                  error={errors.customerName}
                  placeholder="Masukkan nama instansi / perusahaan"
                />
                <Textarea
                  label="Alamat"
                  rows={3}
                  value={form.customerAddress}
                  onChange={(e) => setField('customerAddress', e.target.value)}
                  error={errors.customerAddress}
                  placeholder="Masukkan alamat instansi / perusahaan"
                />
                {isDeliveryNote && (
                  <Input
                    label="Diterima Oleh (Nama Penerima)"
                    value={form.receiverName}
                    onChange={(e) => setField('receiverName', e.target.value)}
                    placeholder="Masukkan nama penerima barang"
                  />
                )}
              </div>
            </Section>

            {/* 3. Komponen / Item */}
            <Section
              title="Komponen / Item"
              subtitle={isDeliveryNote ? "Tambahkan satu atau lebih komponen." : "Tambahkan satu atau lebih komponen beserta harga satuan."}
            >
              {errors.items && <p className="mb-3 text-sm text-error">{errors.items}</p>}
              <div className="space-y-4">
                {form.items.map((item, index) => {
                  const itemError = errors.itemErrors?.[index] || {};
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-4 bg-gray-50/40">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Komponen {index + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveItem(index, -1)}
                            disabled={index === 0}
                            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Naikkan"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(index, 1)}
                            disabled={index === form.items.length - 1}
                            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Turunkan"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <Input
                            label="Nama Komponen"
                            value={item.nama_komponen}
                            onChange={(e) => updateItem(index, 'nama_komponen', e.target.value)}
                            error={itemError.nama_komponen}
                            placeholder="Masukkan nama komponen"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Textarea
                            label="Detail Pekerjaan / Spesifikasi (satu poin per baris)"
                            rows={3}
                            value={item.spesifikasi}
                            onChange={(e) => updateItem(index, 'spesifikasi', e.target.value)}
                            placeholder={'Masukkan detail pekerjaan, satu poin per baris'}
                          />
                        </div>
                        <Input
                          label="Volume / Qty"
                          type="number"
                          min="0"
                          step="1"
                          value={item.volume}
                          onChange={(e) => updateItem(index, 'volume', e.target.value)}
                          error={itemError.volume}
                          placeholder="Masukkan jumlah"
                        />
                        <Select
                          label="Satuan"
                          value={item.satuan}
                          onChange={(e) => updateItem(index, 'satuan', e.target.value)}
                          error={itemError.satuan}
                        >
                          <option value="">Pilih satuan</option>
                          {SATUAN_OPTIONS.map((satuan) => (
                            <option key={satuan} value={satuan}>
                              {satuan}
                            </option>
                          ))}
                        </Select>
                        {!isDeliveryNote && (
                          <>
                            <Input
                              label="Harga Satuan (Rp)"
                              type="number"
                              min="0"
                              step="1"
                              value={item.harga_satuan}
                              onChange={(e) => updateItem(index, 'harga_satuan', e.target.value)}
                              error={itemError.harga_satuan}
                              placeholder="Masukkan harga satuan"
                            />
                            <div className="w-full">
                              <label className="block text-sm font-medium text-text-primary mb-1.5">
                                Subtotal
                              </label>
                              <div className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-medium text-text-primary">
                                {rupiah(computeItemSubtotal(item))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addItem}>
                  Tambah Komponen
                </Button>
              </div>
            </Section>

            {/* 4. Perhitungan Harga (tidak untuk Surat Jalan) */}
            {!isDeliveryNote && (
              <Section title="Perhitungan Harga">
                <div className="rounded-lg border border-border bg-gray-50/60 p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Total</span>
                    <span className="font-medium text-text-primary">{rupiah(totals.total)}</span>
                  </div>
                </div>
              </Section>
            )}

            {/* 5. Keterangan */}
            <Section title="Keterangan">
              <div className="space-y-4">
                {form.notes.map((note, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="flex-1">
                      <Textarea
                        rows={2}
                        value={note}
                        onChange={(e) => updateNote(index, e.target.value)}
                        placeholder="Masukkan keterangan"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNote(index)}
                      className="mt-6 p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Hapus Keterangan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addNote}>
                  Tambah Keterangan
                </Button>
              </div>
            </Section>

            {/* 6. Informasi Penandatangan */}
            <Section title="Informasi Penandatangan">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Toggle
                    checked={form.useSignature}
                    onChange={(v) => setField('useSignature', v)}
                    label="Gunakan Tanda Tangan"
                    description="Tampilkan tanda tangan pada surat."
                  />
                </div>
                {form.useSignature && (
                  <>
                    <Input
                      label="Nama Perusahaan"
                      value={form.companyName}
                      onChange={(e) => setField('companyName', e.target.value)}
                      placeholder="Masukkan nama perusahaan"
                    />
                    <Input
                      label="Nama Penandatangan"
                      value={form.signerName}
                      onChange={(e) => setField('signerName', e.target.value)}
                      error={errors.signerName}
                      placeholder="Masukkan nama penandatangan"
                    />
                    <Input
                      label="Jabatan"
                      value={form.signerTitle}
                      onChange={(e) => setField('signerTitle', e.target.value)}
                      placeholder="Masukkan jabatan"
                    />
                    <div className="sm:col-span-2">
                      <ImageAssetField
                        label="Tanda tangan"
                        kind="signature"
                        image={form.signatureImage}
                        x={form.signatureX}
                        y={form.signatureY}
                        zoom={form.signatureZoom}
                        error={imageErrors.signature}
                        assets={assets.signature}
                        assetsLoading={assetsLoading.signature}
                        uploading={uploading.signature}
                        onUploadFile={(file) => handleUploadAsset(file)}
                        onSelectAsset={(asset) => handleSelectAsset(asset.url, asset.id)}
                        onChange={(key, value) => setField(`signature${key.charAt(0).toUpperCase()}${key.slice(1)}`, value)}
                        onRemove={() => handleImageRemove()}
                      />
                    </div>
                  </>
                )}
              </div>
            </Section>
          </div>

          {/* ------------------------------------------------------- PREVIEW */}
          <div className="lg:col-span-1 min-w-0 lg:sticky lg:top-6">
            <Card className="!p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-border bg-gray-50/60">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary">Live Preview</h3>
                  <span className="hidden sm:inline text-xs text-text-muted">A4 · {cfg.label}</span>
                </div>
                <ZoomControls
                  zoom={effectiveZoom}
                  isFit={isFit}
                  canZoomIn={canZoomIn}
                  canZoomOut={canZoomOut}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onFit={fitToWidth}
                />
              </div>
              <div
                ref={previewViewportRef}
                className="p-3 sm:p-4 bg-gray-100 max-h-[78vh] overflow-auto"
              >
                <div className="letter-zoom w-fit mx-auto" style={{ zoom: scale }}>
                  {isDeliveryNote ? (
                    <SuratJalanPreview form={form} />
                  ) : (
                    <SuratJenisPreview form={form} title={cfg.docTitle} />
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
