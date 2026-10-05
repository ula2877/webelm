import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  FileDown,
  Plus,
  Minus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  RotateCcw,
  Upload,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Textarea, Select } from '../components/ui/Input';
import QuotationPreview from '../components/QuotationPreview';
import { cn } from '../utils/helpers';
import * as suratService from '../services/surat';
import {
  createInitialForm,
  emptyItem,
  formatNomorSurat,
  validateQuotation,
  saveDraft,
  loadDraft,
  clearDraft,
  buildQuotationPayload,
  computeItemSubtotal,
  buildQuotationTotals,
  validateImageFile,
  rupiah,
} from '../utils/quotation';

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

// Upload + position controls for a signature/stamp image.
// Files are uploaded to the server (stored in tb_surat_asset); the preview
// shows the resulting URL. Positions use sliders (realtime).
function ImageAssetField({
  label,
  kind,
  image,
  x,
  y,
  zoom,
  error,
  assets,
  assetsLoading,
  uploading,
  onUploadFile,
  onSelectAsset,
  onChange,
  onRemove,
}) {
  const inputId = `upload-${kind}`;
  const [mode, setMode] = useState('new'); // 'new' | 'library'

  const slider = (sliderLabel, value, key, min, max, step, suffix = '') => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-text-secondary">{sliderLabel}</label>
        <span className="text-xs font-semibold text-text-primary tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(key, Number(e.target.value))}
        className="w-full accent-primary-600"
      />
    </div>
  );

  return (
    <div className="rounded-lg border border-border p-4 bg-gray-50/40">
      {/* Mode switch */}
      <div className="inline-flex rounded-lg border border-border overflow-hidden mb-3">
        <button
          type="button"
          onClick={() => setMode('new')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors',
            mode === 'new' ? 'bg-primary-600 text-white' : 'bg-white text-text-secondary hover:bg-gray-50'
          )}
        >
          Upload File Baru
        </button>
        <button
          type="button"
          onClick={() => setMode('library')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors border-l border-border',
            mode === 'library' ? 'bg-primary-600 text-white' : 'bg-white text-text-secondary hover:bg-gray-50'
          )}
        >
          Gunakan File Sebelumnya
        </button>
      </div>

      {mode === 'new' ? (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-white text-sm font-medium text-text-primary transition-colors cursor-pointer hover:bg-gray-50',
              uploading && 'opacity-50 pointer-events-none'
            )}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Mengunggah...' : 'Pilih File'}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(e) => {
              onUploadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <span className="text-xs text-text-muted">PNG, JPG, JPEG, atau WEBP.</span>
        </div>
      ) : (
        <div>
          {assetsLoading ? (
            <div className="flex items-center gap-2 text-xs text-text-muted py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat file...
            </div>
          ) : assets.length === 0 ? (
            <p className="text-xs text-text-muted py-2">Belum ada file {label.toLowerCase()} tersimpan.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelectAsset(asset)}
                  className={cn(
                    'rounded-lg border bg-white p-2 flex flex-col items-center gap-1 transition-colors hover:border-primary-400',
                    image === asset.url ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border'
                  )}
                  title={asset.original_name || `Asset #${asset.id}`}
                >
                  <img
                    src={asset.url}
                    alt={asset.original_name || label}
                    className="h-14 w-full object-contain"
                  />
                  <span className="text-[10px] text-text-muted truncate w-full text-center">
                    {asset.original_name || `#${asset.id}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-error">{error}</p>}

      {/* Active image + actions */}
      {image && (
        <div className="mt-3 flex items-start gap-3 border-t border-border pt-3">
          <div className="w-24 h-24 shrink-0 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden">
            <img src={image} alt={label} className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Hapus
            </button>
          </div>
        </div>
      )}

      {image && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          {slider('Posisi X', x, 'x', -150, 150, 1)}
          {slider('Posisi Y', y, 'y', -150, 150, 1)}
          {slider('Zoom', zoom, 'zoom', 10, 300, 5, '%')}
        </div>
      )}
    </div>
  );
}

export default function CreateSuratQuotation() {
  const navigate = useNavigate();
  const [form, setForm] = useState(createInitialForm);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Frontend-only: surface a locally saved draft, if any (no backend/draft API).
  const [initialDraft] = useState(() => loadDraft());
  const [draftInfo, setDraftInfo] = useState(initialDraft?.savedAt ?? null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(!!initialDraft?.form);

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
    () => buildQuotationTotals(form.items, form.usePPN, form.ppnRate, form.useDP, form.dpRate),
    [form.items, form.usePPN, form.ppnRate, form.useDP, form.dpRate]
  );

  const showNotice = useCallback((type, message) => {
    setNotice({ type, message });
  }, []);

  const setField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Keep the nomor in sync with the tanggal year unless the user edited it manually.
  const handleTanggalChange = (value) => {
    setForm((prev) => {
      const autoNomor = formatNomorSurat(1101, prev.tanggal);
      const shouldSync = !prev.nomor || prev.nomor === autoNomor;
      return {
        ...prev,
        tanggal: value,
        nomor: shouldSync ? formatNomorSurat(1101, value) : prev.nomor,
      };
    });
  };

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

  const handleSelectAsset = useCallback((field, url) => {
    setForm((prev) => ({ ...prev, [field]: url }));
  }, []);

  // Assets are chosen by URL; "Hapus" only detaches it from this form. The
  // stored record in tb_surat_asset is never deleted (reusable on other letters).
  const handleImageRemove = useCallback((field) => {
    setForm((prev) => ({ ...prev, [field]: null }));
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
  const handleRestoreDraft = () => {
    const draft = loadDraft();
    if (draft?.form) {
      setForm({ ...createInitialForm(), ...draft.form });
      showNotice('success', 'Draft berhasil dimuat.');
    }
    setShowDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setDraftInfo(null);
    setShowDraftPrompt(false);
  };

  const handleSaveDraft = () => {
    const saved = saveDraft(form);
    if (saved) {
      const now = new Date().toISOString();
      setDraftInfo(now);
      setShowDraftPrompt(false);
      showNotice('success', 'Draft disimpan di perangkat ini (belum tersimpan ke server).');
    } else {
      showNotice('error', 'Gagal menyimpan draft di perangkat ini.');
    }
  };

  const handleGenerate = () => {
    const { valid, errors: validationErrors } = validateQuotation(form);
    setErrors(validationErrors);
    if (!valid) {
      showNotice('error', 'Lengkapi field wajib sebelum generate surat.');
      return;
    }

    setIsSubmitting(true);
    // Frontend-only: not persisted to the server (no create/PDF endpoint yet and
    // the database is read-only). We log the exact payload the backend would
    // receive, then trigger the browser's print-to-PDF on the live preview.
    //
    // eslint-disable-next-line no-console
    console.log('[quotation] payload siap kirim:', buildQuotationPayload(form));

    setTimeout(() => {
      setIsSubmitting(false);
      showNotice(
        'success',
        'Preview siap. Gunakan dialog cetak untuk menyimpan sebagai PDF.'
      );
      window.print();
    }, 250);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/letters/quotation')}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Buat Surat Penawaran</h2>
            <p className="text-text-secondary mt-1">Susun penawaran dengan live preview</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            icon={Save}
            onClick={handleSaveDraft}
            className="whitespace-nowrap"
          >
            Simpan Draft
          </Button>
          <Button
            type="button"
            icon={isSubmitting ? Loader2 : FileDown}
            onClick={handleGenerate}
            disabled={isSubmitting}
            className="whitespace-nowrap"
          >
            {isSubmitting ? 'Memproses...' : 'Generate Surat'}
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

      {/* Draft prompt (frontend-only) */}
      {showDraftPrompt && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-800">
          <p className="text-sm flex-1">
            Ditemukan draft tersimpan di perangkat ini
            {draftInfo ? ` (${new Date(draftInfo).toLocaleString('id-ID')})` : ''}.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" icon={RotateCcw} onClick={handleRestoreDraft}>
              Muat Draft
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={handleDiscardDraft}>
              Abaikan
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ---------------------------------------------------------- FORM */}
        <div className="lg:col-span-1 min-w-0 space-y-6">
          {/* 1. Informasi Surat */}
          <Section title="Informasi Surat">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nomor Surat"
                value={form.nomor}
                onChange={(e) => setField('nomor', e.target.value)}
                error={errors.nomor}
                placeholder="PNR/01101/ELMECH/2026"
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
                placeholder="Surabaya"
              />
              <Input
                label="Lampiran"
                value={form.attachment}
                onChange={(e) => setField('attachment', e.target.value)}
                placeholder="1 (Satu) Berkas"
              />
              <div className="sm:col-span-2">
                <Input
                  label="Hal / Judul Surat"
                  value={form.subject}
                  onChange={(e) => setField('subject', e.target.value)}
                  error={errors.subject}
                  placeholder="Surat Penawaran Harga ..."
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
                placeholder="PSDKP BENOA"
              />
              <Textarea
                label="Alamat"
                rows={3}
                value={form.customerAddress}
                onChange={(e) => setField('customerAddress', e.target.value)}
                error={errors.customerAddress}
                placeholder="Jalan Raya Pelabuhan Umum Benoa, ..."
              />
            </div>
          </Section>

          {/* 3. Deskripsi Penawaran */}
          <Section title="Deskripsi Penawaran">
            <div className="grid grid-cols-1 gap-4">
              <Input
                label="Nama / Deskripsi Sistem yang Ditawarkan"
                value={form.systemName}
                onChange={(e) => setField('systemName', e.target.value)}
                placeholder="sistem manajemen keuangan"
              />
            </div>
          </Section>

          {/* 4. Komponen / Item Penawaran */}
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
                          placeholder="Jasa Analisis dan Perancangan"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Textarea
                          label="Spesifikasi (satu poin per baris)"
                          rows={3}
                          value={item.spesifikasi}
                          onChange={(e) => updateItem(index, 'spesifikasi', e.target.value)}
                          placeholder={'Analisis kebutuhan sistem\nPenyusunan dokumen spesifikasi'}
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
                      />
                      <Select
                        label="Satuan"
                        value={item.satuan}
                        onChange={(e) => updateItem(index, 'satuan', e.target.value)}
                        error={itemError.satuan}
                      >
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
                  />
                </div>
              )}
              <Toggle
                checked={form.useDP}
                onChange={(v) => setField('useDP', v)}
                label="Gunakan DP"
                description="Tambahkan Down Payment sebagai biaya di awal."
              />
              {form.useDP && (
                <div className="sm:max-w-[200px]">
                  <Input
                    label="Persentase DP (%)"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.dpRate}
                    onChange={(e) => setField('dpRate', e.target.value)}
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
                {form.useDP && (
                  <>
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-text-secondary">
                        DP ({Number(form.dpRate) || 0}%)
                      </span>
                      <span className="font-medium text-text-primary">{rupiah(totals.dp)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text-primary">Sisa Pembayaran</span>
                      <span className="font-bold text-primary-700">{rupiah(totals.remaining)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Section>

          {/* 6. Keterangan */}
          <Section title="Keterangan">
            <div className="space-y-3">
              {form.notes.map((note, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      value={note}
                      onChange={(e) => updateNote(index, e.target.value)}
                      placeholder="Durasi penyelesaian 3 Bulan."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeNote(index)}
                    className="mt-0.5 p-2.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                    title="Hapus keterangan"
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

          {/* 7. Informasi Penandatangan */}
          <Section title="Informasi Penandatangan">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Nama Perusahaan"
                  value={form.companyName}
                  onChange={(e) => setField('companyName', e.target.value)}
                />
              </div>
              <Input
                label="Nama Penandatangan"
                value={form.signerName}
                onChange={(e) => setField('signerName', e.target.value)}
                error={errors.signerName}
                placeholder="Muhammad Taufiq Rahman"
              />
              <Input
                label="Jabatan"
                value={form.signerTitle}
                onChange={(e) => setField('signerTitle', e.target.value)}
                placeholder="Direktur"
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
                      onSelectAsset={(asset) => handleSelectAsset('signatureImage', asset.url)}
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
                      onSelectAsset={(asset) => handleSelectAsset('stampImage', asset.url)}
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
                <span className="hidden sm:inline text-xs text-text-muted">A4 · Surat Penawaran</span>
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
                <QuotationPreview form={form} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
