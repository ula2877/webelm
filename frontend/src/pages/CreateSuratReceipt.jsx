import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Textarea } from '../components/ui/Input';
import ReceiptPreview from '../components/ReceiptPreview';
import { buildPreviewHtml } from '../utils/quotationPrintHtml';
import { cn } from '../utils/helpers';
import * as suratService from '../services/surat';
import { validateImageFile } from '../utils/suratJenis';
import {
  KW_PRINT_CSS,
  buildReceiptPayload,
  createInitialReceiptForm,
  formatTerbilang,
  formatTanggalKwitansi,
  formFromReceiptDetail,
  terisiBilaKosong,
  validateReceipt,
} from '../utils/receipt';
import { ImageAssetField, Section, Toggle, ZoomControls } from './CreateSuratQuotation';

const ZOOM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200];
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

const CFG = {
  routeBase: 'letters/receipt',
  label: 'Kwitansi',
  pdfPrefix: 'Kwitansi',
  jenis: 'kuitansi',
};

// Lebar kwitansi 23 cm (bukan A4 21 cm) - dasar perhitungan fit-to-width.
const KW_WIDTH_PX = (23 * 96) / 2.54;

// Halaman Create/Edit Kwitansi.
// Layout dua kolom (form kiri, Live Preview kanan) sama seperti modul
// surat lain. Bedanya: preview berupa template 23 x 9 cm, jadi tidak ada
// paginasi A4 dan zoom diukur terhadap lebar kwitansi (bukan A4).
export default function CreateSuratReceipt() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);

  const [isLoadingDetail, setIsLoadingDetail] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(() => createInitialReceiptForm());
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assetIds, setAssetIds] = useState({ signature: null, stamp: null });

  // ---- Live preview zoom (fit-to-width by default) ----
  const previewViewportRef = useRef(null);
  const [zoom, setZoom] = useState(100);
  const [isFit, setIsFit] = useState(true);
  const [fitPercent, setFitPercent] = useState(100);

  const measureFit = useCallback(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;
    const styles = window.getComputedStyle(viewport);
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const available = viewport.clientWidth - padX;
    if (!available) return;
    setFitPercent(
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.floor((available / KW_WIDTH_PX) * 100)))
    );
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
      setZoom(ZOOM_LEVELS.find((l) => l >= fitPercent) ?? ZOOM_MAX);
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

  const showNotice = useCallback((type, message) => setNotice({ type, message }), []);
  const setField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Terbilang langsung dari nominal, selalu terlihat di form.
  const nominalAngka = Number(form.nominal) || 0;
  const previewTerbilang = useMemo(
    () => (nominalAngka > 0 ? formatTerbilang(nominalAngka) : '-'),
    [nominalAngka]
  );

  // Nomor kwitansi mengikuti tanggal (dihitung backend, KWT/DDMM[urutan]).
  useEffect(() => {
    if (isEditMode) return undefined;
    let cancelled = false;
    if (!form.tanggal) {
      setField('nomor', '');
      return undefined;
    }
    suratService
      .fetchNextSuratJenisNumber(CFG.jenis, form.tanggal)
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

  // ---- Mode EDIT ----
  useEffect(() => {
    if (!isEditMode) return undefined;
    let cancelled = false;
    setIsLoadingDetail(true);
    setLoadError(null);
    suratService
      .fetchQuotationDetail(editId)
      .then((res) => {
        if (cancelled) return;
        if (res?.status !== 'ok' || !res.data || res.data.jenis !== CFG.jenis) {
          setLoadError('Kwitansi tidak ditemukan.');
          return;
        }
        const { assetIds: ids, form: loaded } = formFromReceiptDetail(res.data);
        setAssetIds(ids);
        setForm(loaded);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Gagal memuat data kwitansi.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditMode, editId]);

  // ------------------------------------------------- Sumber: Invoice (opsional)
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setInvoiceLoading(true);
    suratService
      .fetchSurat({ search: '', jenis: 'invoice', page: 1, perPage: 100 })
      .then((res) => {
        if (!cancelled && res?.status === 'ok') setInvoiceOptions(res.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setInvoiceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pilih invoice -> isi penerima/nominal/nomor invoice. Invoice sumber
  // TIDAK diubah, dan field yang sudah diketik user tidak ditimpa.
  const handleInvoiceChange = async (value) => {
    if (!value) {
      setForm((prev) => ({ ...prev, sumberId: null, sumberJenis: '' }));
      return;
    }
    setField('sumberId', Number(value));
    setField('sumberJenis', 'invoice');
    try {
      const res = await suratService.fetchQuotationDetail(value);
      if (res?.status !== 'ok' || !res.data) return;
      const d = res.data.data || {};
      // `total` tb_surat = grandTotal invoice (sudah termasuk PPN).
      const nominalInvoice =
        res.data.total ?? d.totals?.grandTotal ?? d.totals?.total ?? null;
      // Keterangan pembayaran dirangkum dari item invoice.
      const rincian = (res.data.items || [])
        .map((it) => String(it.nama_komponen || '').trim())
        .filter(Boolean);
      const keterangan = rincian.length ? `Pembayaran ${rincian.join(', ')}` : '';

      setForm((prev) => ({
        ...prev,
        sumberId: Number(value),
        sumberJenis: 'invoice',
        nomorInvoice: res.data.nomor || prev.nomorInvoice,
        tanggalInvoice: res.data.tanggal || prev.tanggalInvoice,
        customerName: terisiBilaKosong(prev.customerName, d.customerName || res.data.pengirim),
        nominal: terisiBilaKosong(prev.nominal, nominalInvoice),
        untukPembayaran: terisiBilaKosong(prev.untukPembayaran, keterangan),
      }));
    } catch (err) {
      showNotice('error', err.message || 'Gagal mengambil data invoice.');
    }
  };

  // ------------------------------------------------- signature / stamp assets
  const [imageErrors, setImageErrors] = useState({});
  const [assets, setAssets] = useState({ signature: [], stamp: [] });
  const [assetsLoading, setAssetsLoading] = useState({ signature: false, stamp: false });
  const [uploading, setUploading] = useState({ signature: false, stamp: false });

  const loadAssets = useCallback(
    async (jenis) => {
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
    },
    [showNotice]
  );

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
          setAssetIds((prev) => ({ ...prev, [jenis]: res.data.id ?? null }));
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
    setAssetIds((prev) => ({
      ...prev,
      [field === 'signatureImage' ? 'signature' : 'stamp']: assetId ?? null,
    }));
  }, []);

  // "Hapus" hanya melepas dari form; record tb_surat_asset tidak dihapus.
  const handleImageRemove = useCallback((field) => {
    setForm((prev) => ({ ...prev, [field]: null }));
    setAssetIds((prev) => ({
      ...prev,
      [field === 'signatureImage' ? 'signature' : 'stamp']: null,
    }));
  }, []);

  // ---------------------------------------------------------------- actions
  const validateForm = () => {
    const { valid, errors: validationErrors } = validateReceipt(form);
    setErrors(validationErrors);
    if (!valid) {
      showNotice('error', 'Lengkapi field wajib sebelum menyimpan.');
      return false;
    }
    return true;
  };

  const handleSaveAndDownload = async () => {
    if (isSubmitting || !validateForm()) return;
    setIsSubmitting(true);
    try {
      const payload = buildReceiptPayload(form, assetIds);
      const res = isEditMode
        ? await suratService.updateSuratJenis(editId, CFG.jenis, payload)
        : await suratService.saveSuratJenis(CFG.jenis, payload);
      if (res.status !== 'ok' || (!isEditMode && !res.data?.id)) {
        showNotice('error', res.message || 'Gagal menyimpan kwitansi.');
        return;
      }

      // PDF dari HTML Live Preview yang sama. KW_PRINT_CSS mengubah
      // @page jadi 230mm x 90mm -> PDF bukan A4.
      const previewHtml = await buildPreviewHtml(KW_PRINT_CSS);
      const blob = await suratService.downloadQuotationPdfFromHtml(previewHtml);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const nomor = String(res.data.nomor || form.nomor || 'kwitansi').replace(
        /[\\/:*?"<>|]+/g,
        '_'
      );
      a.download = `${CFG.pdfPrefix}-${nomor}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showNotice(
        'success',
        isEditMode
          ? 'Kwitansi diperbarui dan PDF berhasil diunduh.'
          : 'Kwitansi tersimpan dan PDF berhasil diunduh.'
      );
    } catch (err) {
      // Tampilkan pesan validasi per-field dari Laravel (422) kalau ada.
      const fieldErrors = err?.errors
        ? Object.entries(err.errors)
            .map(([field, msgs]) => `${field}: ${[].concat(msgs).join(' ')}`)
            .join(' | ')
        : '';
      showNotice(
        'error',
        fieldErrors
          ? `Validasi gagal - ${fieldErrors}`
          : err.message || 'Gagal menyimpan / mengunduh PDF.'
      );
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
            onClick={() => navigate(`/${CFG.routeBase}`)}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">{isEditMode ? `Edit ${CFG.label}` : `Buat ${CFG.label}`}</h2>
            <p className="page-subtitle">
              {isEditMode
                ? 'Ubah kwitansi dengan live preview 23 x 9 cm'
                : 'Susun kwitansi dengan live preview 23 x 9 cm'}
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

      {isEditMode && isLoadingDetail && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      )}
      {isEditMode && loadError && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border bg-red-50 border-red-200 text-red-800"
          role="alert"
        >
          <p className="text-sm flex-1">{loadError}</p>
        </div>
      )}

      {(!isEditMode || (!isLoadingDetail && !loadError)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ---------------------------------------------------------- FORM */}
          <div className="lg:col-span-1 min-w-0 space-y-6">
            {/* 1. Sumber Kwitansi */}
            <Section title="Sumber Kwitansi" subtitle="Opsional — isi otomatis dari Invoice.">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    Ambil dari Invoice
                  </label>
                  <select
                    value={form.sumberId || ''}
                    onChange={(e) => handleInvoiceChange(e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">-- Tanpa sumber invoice --</option>
                    {invoiceLoading ? (
                      <option disabled>Memuat...</option>
                    ) : (
                      invoiceOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nomor} — {o.pengirim || '-'}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <Input
                  label="Nomor Invoice"
                  value={form.nomorInvoice}
                  onChange={(e) => setField('nomorInvoice', e.target.value)}
                  placeholder="Terisi otomatis jika invoice dipilih"
                />
              </div>
            </Section>

            {/* 2. Informasi Kwitansi */}
            <Section title="Informasi Kwitansi">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nomor Kwitansi"
                  value={form.nomor}
                  onChange={(e) => setField('nomor', e.target.value)}
                  error={errors.nomor}
                  placeholder="Nomor dibuat otomatis"
                  readOnly
                />
                <Input
                  label="Tanggal Kwitansi"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setField('tanggal', e.target.value)}
                  error={errors.tanggal}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Penerima"
                    value={form.customerName}
                    onChange={(e) => setField('customerName', e.target.value)}
                    error={errors.customerName}
                    placeholder="Nama penerima / customer"
                  />
                </div>
                <Input
                  label="Nominal"
                  type="number"
                  min="0"
                  step="1"
                  value={form.nominal}
                  onChange={(e) => setField('nominal', e.target.value)}
                  error={errors.nominal}
                  placeholder="Masukkan nominal"
                />
                <Input
                  label="Tempat"
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                  placeholder="Surabaya"
                />
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    Terbilang (otomatis dari nominal)
                  </label>
                  <p className="px-3 py-2.5 rounded-lg border border-border bg-gray-50 text-sm text-text-secondary">
                    {previewTerbilang}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Textarea
                    label="Untuk Pembayaran"
                    rows={3}
                    value={form.untukPembayaran}
                    onChange={(e) => setField('untukPembayaran', e.target.value)}
                    error={errors.untukPembayaran}
                    placeholder="Keterangan pembayaran atas invoice tersebut"
                  />
                </div>
              </div>
            </Section>

            {/* 3. Penandatangan */}
            <Section title="Informasi Penandatangan">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Nama Perusahaan"
                    value={form.companyName}
                    onChange={(e) => setField('companyName', e.target.value)}
                    placeholder="CV. Elmech Technology Indonesia"
                  />
                </div>
                <Input
                  label="Nama Penandatangan"
                  value={form.signerName}
                  onChange={(e) => setField('signerName', e.target.value)}
                  placeholder="Masukkan nama penandatangan"
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
                    description="Tampilkan gambar tanda tangan pada kwitansi."
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
                        onUploadFile={(file) =>
                          handleUploadAsset('signature', 'signatureImage', 'signature', file)
                        }
                        onSelectAsset={(asset) =>
                          handleSelectAsset('signatureImage', asset.url, asset.id)
                        }
                        onChange={(key, value) =>
                          setField(
                            { x: 'signatureX', y: 'signatureY', zoom: 'signatureZoom' }[key],
                            value
                          )
                        }
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
                    description="Tampilkan gambar stempel pada kwitansi."
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
                        onUploadFile={(file) =>
                          handleUploadAsset('stamp', 'stampImage', 'stamp', file)
                        }
                        onSelectAsset={(asset) => handleSelectAsset('stampImage', asset.url, asset.id)}
                        onChange={(key, value) =>
                          setField({ x: 'stampX', y: 'stampY', zoom: 'stampZoom' }[key], value)
                        }
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
                  <span className="hidden sm:inline text-xs text-text-muted">23 &times; 9 cm</span>
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
                  <ReceiptPreview form={form} />
                </div>
              </div>
            </Card>
            <p className="mt-2 text-xs text-text-muted text-center">
              Tanggal cetak: {form.city || 'Surabaya'}, {formatTanggalKwitansi(form.tanggal)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
