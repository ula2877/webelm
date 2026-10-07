import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileDown,
  Plus,
  Minus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Upload,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Textarea, Select } from '../components/ui/Input';
import InvoicePreview from '../components/InvoicePreview';
import { ImageAssetField } from './CreateSuratQuotation';
import { buildPreviewHtml } from '../utils/quotationPrintHtml';
import { cn } from '../utils/helpers';
import * as suratService from '../services/surat';
import {
  createInitialInvoiceForm,
  emptyItem,
  validateInvoice,
  buildInvoicePayload,
  computeItemSubtotal,
  buildInvoiceTotals,
  validateImageFile,
  rupiah,
  formFromInvoiceDetail,
} from '../utils/invoice';

const SECTION_HEADING = 'text-base font-semibold text-text-primary';
const SECTION_SUBTITLE = 'text-sm text-text-secondary mt-0.5';

// Allowed satuan values for quotation line items.
const SATUAN_OPTIONS = ['PCS', 'Paket', 'OH', 'LS'];

// Live Preview zoom levels (percent). Default is "Fit to width" computed at runtime.
const ZOOM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 125, 150];
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

function ZoomControls({ zoom, isFit, canZoomIn, canZoomOut, onZoomIn, onZoomOut, onFit }) {
  const btnClass =
    'p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className={btnClass}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-11 text-center text-xs font-medium text-text-secondary tabular-nums">
        {isFit ? 'Fit' : `${zoom}%`}
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className={btnClass}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onFit}
        className={cn(
          'ml-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
          isFit
            ? 'bg-primary-50 text-primary-700'
            : 'text-text-muted hover:text-text-primary hover:bg-gray-100'
        )}
        title="Fit to width"
      >
        Fit
      </button>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <Card>
      <div className="mb-4">
        <h3 className={SECTION_HEADING}>{title}</h3>
        {subtitle && <p className={SECTION_SUBTITLE}>{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
          checked ? 'bg-primary-600' : 'bg-gray-300'
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {description && <span className="block text-xs text-text-secondary">{description}</span>}
      </span>
    </label>
  );
}

export default function CreateSuratInvoice() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);
  const [isLoadingDetail, setIsLoadingDetail] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(createInitialInvoiceForm);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Hasil save terakhir (id/uuid dari backend) - surat yang tersimpan.
  const [savedSurat, setSavedSurat] = useState(null);
  // ID asset (tb_surat_asset) yang dipilih untuk tanda tangan/stempel.
  // null = tidak pakai / belum dipilih. Gambar tidak disimpan di form,
  // hanya ID-nya yang dikirim ke backend (id_asset_ttd/id_asset_stempel).
  const [assetIds, setAssetIds] = useState({ signature: null, stamp: null });

  // ---- Live preview zoom (fit-to-width by default) ----
  const previewViewportRef = useRef(null);
  const [zoom, setZoom] = useState(100); // percent, used when not in Fit mode
  const [isFit, setIsFit] = useState(true);
  const [fitPercent, setFitPercent] = useState(100);

  // Compute the zoom % that makes the whole A4 width fit the preview viewport.
  // A4 is a fixed absolute width (210mm), so we compare the viewport width
  // against 210mm expressed in CSS px (96dpi). No sheet measurement needed.
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

  // Recompute fit when entering fit mode and whenever the viewport is resized.
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
      // Seed the manual level from the current fit value, then step up.
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
    () => buildInvoiceTotals(form.items, form.usePPN, form.ppnRate),
    [form.items, form.usePPN, form.ppnRate]
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
      .fetchNextInvoiceNumber(form.tanggal)
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
  }, [form.tanggal, isEditMode]);

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
        if (res?.status !== 'ok' || !res.data) {
          setLoadError('Surat tidak ditemukan.');
          return;
        }
        const s = res.data;
        setAssetIds({
          signature: s.id_asset_ttd ?? null,
          stamp: s.id_asset_stempel ?? null,
        });
        setForm((prev) => ({ ...prev, ...formFromInvoiceDetail(s) }));
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
  }, [isEditMode, editId]);

  // ------------------------------------------------- signature / stamp images
  // Files are uploaded to the server (recorded in tb_surat_asset). The stored
  // absolute URL is kept in the form state and shown in the Live Preview.
  const [imageErrors, setImageErrors] = useState({});
  const [assets, setAssets] = useState({ signature: [], stamp: [] });
  const [assetsLoading, setAssetsLoading] = useState({ signature: false, stamp: false });
  const [uploading, setUploading] = useState({ signature: false, stamp: false });

  const loadAssets = useCallback(async (jenis) => {
    setAssetsLoading((prev) => ({ ...prev, [jenis]: true }));
    try {
      const res = await suratService.fetchSuratAssets(jenis);
      if (res.status === 'ok') {
        setAssets((prev) => ({ ...prev, [jenis]: res.data || [] }));
      }
    } catch (err) {
      showNotice('error', err.message || 'Gagal memuat asset sebelumnya.');
    } finally {
      setAssetsLoading((prev) => ({ ...prev, [jenis]: false }));
    }
  }, [showNotice]);

  // Daftar Surat Penawaran untuk "Ambil dari Surat Penawaran".
  const [quotationOptions, setQuotationOptions] = useState([]);
  useEffect(() => {
    let cancelled = false;
    suratService
      .fetchSurat({ search: '', jenis: 'quotation', page: 1, perPage: 100 })
      .then((res) => {
        if (!cancelled && res?.status === 'ok') setQuotationOptions(res.data || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Pilih Surat Penawaran -> isi customer/item/nomorPenawaran tanpa mengubah
  // Surat Penawaran sumbernya.
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
          city: d.city || prev.city,
          usePPN: !!d.usePPN,
          ppnRate: d.ppnRate ?? 11,
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
      showNotice('error', err.message || 'Gagal mengambil data surat penawaran.');
    }
  };

  // Load the previously stored signature/stamp lists once on mount.
  useEffect(() => {
    loadAssets('signature');
    loadAssets('stamp');
  }, [loadAssets]);

  const handleUploadAsset = useCallback(
    async (jenis, field, errorKey, file) => {
      const err = validateImageFile(file);
      if (err) {
        setImageErrors((prev) => ({ ...prev, [errorKey]: err }));
        return;
      }
      setImageErrors((prev) => ({ ...prev, [errorKey]: null }));
      setUploading((prev) => ({ ...prev, [jenis]: true }));
      try {
        const res = await suratService.uploadSuratAsset(jenis, file);
        if (res.status === 'ok' && res.data?.url) {
          setForm((prev) => ({ ...prev, [field]: res.data.url }));
          // Simpan ID asset-nya (bukan URL) untuk dikirim ke backend.
          setAssetIds((prev) => ({ ...prev, [jenis]: res.data.id ?? null }));
          // Refresh the "file sebelumnya" list so the new asset appears there.
          loadAssets(jenis);
        } else {
          setImageErrors((prev) => ({ ...prev, [errorKey]: 'Gagal mengunggah file.' }));
        }
      } catch (uploadErr) {
        setImageErrors((prev) => ({
          ...prev,
          [errorKey]: uploadErr.message || 'Gagal mengunggah file.',
        }));
      } finally {
        setUploading((prev) => ({ ...prev, [jenis]: false }));
      }
    },
    [loadAssets]
  );

  const handleSelectAsset = useCallback((field, url, assetId) => {
    setForm((prev) => ({ ...prev, [field]: url }));
    // Pilih asset existing = pakai ID asset yang sudah ada di tb_surat_asset.
    setAssetIds((prev) => ({ ...prev, [field === 'signatureImage' ? 'signature' : 'stamp']: assetId ?? null }));
  }, []);

  // Assets are chosen by URL; "Hapus" only detaches it from this form. The
  // stored record in tb_surat_asset is never deleted (reusable on other letters).
  const handleImageRemove = useCallback((field) => {
    setForm((prev) => ({ ...prev, [field]: null }));
    setAssetIds((prev) => ({ ...prev, [field === 'signatureImage' ? 'signature' : 'stamp']: null }));
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

  // ---------------------------------------------------------------- actions
  // Validasi dulu (frontend), lalu backend memvalidasi ulang.
  const validateForm = () => {
    const { valid, errors: validationErrors } = validateInvoice(form);
    setErrors(validationErrors);
    if (!valid) {
      showNotice('error', 'Lengkapi field wajib sebelum menyimpan surat.');
      return false;
    }
    return true;
  };

  // SIMPAN & DOWNLOAD PDF: validasi -> simpan -> generate PDF -> download.
  // Jika simpan/validasi gagal, PDF tidak dibuat.
  const handleSaveAndDownload = async () => {
    if (isSubmitting || !validateForm()) return;
    setIsSubmitting(true);
    try {
      const payload = buildInvoicePayload(form, assetIds);
      // CREATE -> INSERT baru, EDIT -> UPDATE record yang sama.
      const res = isEditMode
        ? await suratService.updateInvoice(editId, payload)
        : await suratService.saveInvoice(payload);
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
      a.download = `Surat-Penawaran-${String(res.data.nomor || form.nomor || 'surat').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`;
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
            onClick={() => navigate('/letters/invoice')}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">{isEditMode ? 'Edit Invoice' : 'Buat Invoice'}</h2>
            <p className="page-subtitle">{isEditMode ? 'Ubah invoice dengan live preview' : 'Susun invoice dengan live preview'}</p>
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
          {/* 1. Informasi Sumber Invoice */}
          <Section title="Informasi Sumber Invoice">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Ambil dari Surat Penawaran"
                value={form.sumberQuotationId || ''}
                onChange={(e) => handleSourceQuotationChange(e.target.value)}
              >
                <option value="">-- Pilih Surat Penawaran (opsional) --</option>
                {quotationOptions.map((q) => (
                  <option key={q.id} value={q.id}>{q.nomor}</option>
                ))}
              </Select>
              <Input
                label="Nomor Penawaran"
                value={form.nomorPenawaran}
                onChange={(e) => setField('nomorPenawaran', e.target.value)}
                placeholder="Masukkan nomor penawaran"
              />
              <Input
                label="Nomor PO/SPK"
                value={form.nomorPo}
                onChange={(e) => setField('nomorPo', e.target.value)}
                placeholder="Masukkan nomor PO/SPK"
              />
            </div>
          </Section>

          {/* 2. Informasi Surat */}
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
                label="Tanggal Invoice"
                type="date"
                value={form.tanggal}
                onChange={(e) => handleTanggalChange(e.target.value)}
                error={errors.tanggal}
              />
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
            </div>
          </Section>

          {/* 4. Komponen / Item */}
          <Section
            title="Komponen / Item Penawaran"
            subtitle="Tambahkan satu atau lebih komponen beserta harga satuan."
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
                          label="Spesifikasi (satu poin per baris)"
                          rows={3}
                          value={item.spesifikasi}
                          onChange={(e) => updateItem(index, 'spesifikasi', e.target.value)}
                          placeholder={'Masukkan spesifikasi, satu poin per baris'}
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

          {/* 5. Perhitungan Harga */}
          <Section title="Perhitungan Harga">
            <div className="space-y-4">
              <Toggle
                checked={form.usePPN}
                onChange={(v) => setField('usePPN', v)}
                label="Gunakan PPN"
                description="Tambahkan Pajak Pertambahan Nilai pada grand total."
              />
              {form.usePPN && (
                <div className="sm:max-w-[200px]">
                  <Input
                    label="Persentase PPN (%)"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.ppnRate}
                    onChange={(e) => setField('ppnRate', e.target.value)}
                    placeholder="Masukkan persentase PPN"
                  />
                </div>
              )}
              <div className="rounded-lg border border-border bg-gray-50/60 p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Total</span>
                  <span className="font-medium text-text-primary">{rupiah(totals.total)}</span>
                </div>
                {form.usePPN && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">
                      PPN ({Number(form.ppnRate) || 0}%)
                    </span>
                    <span className="font-medium text-text-primary">{rupiah(totals.ppn)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="font-semibold text-text-primary">Grand Total</span>
                  <span className="font-bold text-primary-700">{rupiah(totals.grandTotal)}</span>
                </div>
              </div>
            </div>
          </Section>

          {/* 7. Informasi Penandatangan */}
          <Section title="Informasi Penandatangan">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Nama Perusahaan"
                  value={form.companyName}
                  onChange={(e) => setField('companyName', e.target.value)}
                  placeholder="Masukkan nama perusahaan"
                />
              </div>
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

              {/* Tanda tangan */}
              <div className="sm:col-span-2 border-t border-border pt-4">
                <Toggle
                  checked={form.useSignature}
                  onChange={(v) => setField('useSignature', v)}
                  label="Gunakan Tanda Tangan"
                  description="Tampilkan gambar tanda tangan pada surat."
                />
                {form.useSignature && (
                  <div className="mt-3">
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
                      onUploadFile={(file) => handleUploadAsset('signature', 'signatureImage', 'signature', file)}
                      onSelectAsset={(asset) => handleSelectAsset('signatureImage', asset.url, asset.id)}
                      onChange={(key, value) => setField({ x: 'signatureX', y: 'signatureY', zoom: 'signatureZoom' }[key], value)}
                      onRemove={() => handleImageRemove('signatureImage')}
                    />
                  </div>
                )}
              </div>

              {/* Stempel */}
              <div className="sm:col-span-2 border-t border-border pt-4">
                <Toggle
                  checked={form.useStamp}
                  onChange={(v) => setField('useStamp', v)}
                  label="Gunakan Stempel"
                  description="Tampilkan gambar stempel pada surat."
                />
                {form.useStamp && (
                  <div className="mt-3">
                    <ImageAssetField
                      label="Stempel"
                      kind="stamp"
                      image={form.stampImage}
                      x={form.stampX}
                      y={form.stampY}
                      zoom={form.stampZoom}
                      error={imageErrors.stamp}
                      assets={assets.stamp}
                      assetsLoading={assetsLoading.stamp}
                      uploading={uploading.stamp}
                      onUploadFile={(file) => handleUploadAsset('stamp', 'stampImage', 'stamp', file)}
                      onSelectAsset={(asset) => handleSelectAsset('stampImage', asset.url, asset.id)}
                      onChange={(key, value) => setField({ x: 'stampX', y: 'stampY', zoom: 'stampZoom' }[key], value)}
                      onRemove={() => handleImageRemove('stampImage')}
                    />
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>

        {/* ------------------------------------------------------- PREVIEW */}
        <div className="lg:col-span-1 min-w-0 lg:sticky lg:top-6">
          <Card className="!p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-border bg-gray-50/60">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">Live Preview</h3>
                <span className="hidden sm:inline text-xs text-text-muted">A4 · Invoice</span>
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
                <InvoicePreview form={form} />
              </div>
            </div>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
