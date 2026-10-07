import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, FileDown, Loader2, Plus, Trash2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Textarea, Select } from '../components/ui/Input';
import BastPreview from '../components/BastPreview';
import { buildPreviewHtml } from '../utils/quotationPrintHtml';
import { cn } from '../utils/helpers';
import * as suratService from '../services/surat';
import { validateImageFile, emptyItem } from '../utils/suratJenis';
import {
  buildBastPayload,
  createInitialBastForm,
  validateBast,
} from '../utils/bast';
import { ImageAssetField, Section, Toggle, ZoomControls } from './CreateSuratQuotation';

// Live Preview zoom levels (pola sama dengan modul lain).
const ZOOM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 125, 150];
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

const SATUAN_OPTIONS = ['Unit', 'Paket', 'Set', 'PCS', 'OH', 'LS'];

const CFG = {
  routeBase: 'letters/handover',
  label: 'Berita Acara Serah Terima',
  pdfPrefix: 'BAST',
};

// Halaman Create/Edit BAST. Layout dua kolom (form kiri, Live Preview
// kanan) mengikuti modul Surat Penawaran / Invoice / Surat Jalan.
// Struktur form mengikuti dokumen referensi: Sumber Dokumen,
// Informasi Berita Acara, Pihak Pertama, Pihak Kedua,
// Pekerjaan & Komponen, Tanda Tangan.
export default function CreateSuratHandover() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);

  const [isLoadingDetail, setIsLoadingDetail] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(() => createInitialBastForm());
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
    const a4WidthPx = (210 * 96) / 25.4;
    const percent = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, Math.floor((available / a4WidthPx) * 100))
    );
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

  const showNotice = useCallback((type, message) => {
    setNotice({ type, message });
  }, []);

  const setField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Nomor BAST mengikuti tanggal (dihitung backend dari data aktif).
  useEffect(() => {
    if (isEditMode) return undefined;
    let cancelled = false;
    if (!form.tanggal) {
      setField('nomor', '');
      return undefined;
    }
    suratService
      .fetchNextSuratJenisNumber('bast', form.tanggal)
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

  // ---- Mode EDIT: muat data BAST tersimpan ----
  useEffect(() => {
    if (!isEditMode) return undefined;
    let cancelled = false;
    setIsLoadingDetail(true);
    setLoadError(null);
    suratService
      .fetchQuotationDetail(editId)
      .then((res) => {
        if (cancelled) return;
        if (res?.status !== 'ok' || !res.data || res.data.jenis !== 'bast') {
          setLoadError('Berita acara tidak ditemukan.');
          return;
        }
        const s = res.data;
        const d = s.data || {};
        const pos = (raw) => {
          const p = raw && typeof raw === 'object' ? raw : {};
          return {
            x: Number(p.x) || 0,
            y: Number(p.y) || 0,
            zoom: Math.round((Number(p.zoom) || 1) * 100),
          };
        };
        const sigPos = pos(s.posisi_ttd ?? d.signaturePosition);
        const stampPos = pos(s.posisi_stempel ?? d.stampPosition);

        setAssetIds({ signature: s.id_asset_ttd ?? null, stamp: s.id_asset_stempel ?? null });
        setForm(
          createInitialBastForm({
            nomor: s.nomor || '',
            tanggal: s.tanggal || '',
            sumberSuratJalanId: d.sumberSuratJalanId ?? null,
            nomorSuratJalan: d.nomorSuratJalan || '',
            nomorPenawaran: d.nomorPenawaran || '',
            nomorSPK: d.nomorSPK || '',
            tanggalSPK: d.tanggalSPK || '',
            tanggalPelaksanaan: d.tanggalPelaksanaan || '',
            pihakPertamaNama: d.pihakPertamaNama || d.customerName || '',
            pihakPertamaAlamat: d.pihakPertamaAlamat || d.customerAddress || '',
            pihakKeduaNama: d.pihakKeduaNama || '',
            pihakKeduaAlamat: d.pihakKeduaAlamat || '',
            items: Array.isArray(s.items) && s.items.length
              ? s.items.map((it) => ({
                  id: `item-${Math.random().toString(36).slice(2, 9)}`,
                  nama_komponen: it.nama_komponen ?? '',
                  spesifikasi: Array.isArray(it.spesifikasi)
                    ? it.spesifikasi.join('\n')
                    : '',
                  volume: it.volume ?? '',
                  satuan: it.satuan ?? '',
                }))
              : [emptyItem()],
            useSignature: !!d.useSignature,
            signatureImage: d.signatureImage ?? null,
            signatureSide: d.signatureSide ?? 'second',
            signatureX: sigPos.x,
            signatureY: sigPos.y,
            signatureZoom: sigPos.zoom,
            useStamp: !!d.useStamp,
            stampImage: d.stampImage ?? null,
            stampX: stampPos.x,
            stampY: stampPos.y,
            stampZoom: stampPos.zoom,
            pihakPertamaPenandatangan: d.pihakPertamaPenandatangan || '',
            signerName: d.signature?.signerName || '',
            signerTitle: d.signature?.signerTitle || '',
          })
        );
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Gagal memuat data berita acara.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditMode, editId]);

  // ------------------------------------------------- Sumber: Surat Jalan
  const [suratJalanOptions, setSuratJalanOptions] = useState([]);
  const [sjLoading, setSjLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSjLoading(true);
    suratService
      .fetchSurat({ search: '', jenis: 'delivery-note', page: 1, perPage: 100 })
      .then((res) => {
        if (!cancelled && res?.status === 'ok') setSuratJalanOptions(res.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSjLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pilih Surat Jalan -> isi pihak pertama, nomor, dan komponen.
  // Data Surat Jalan TIDAK diubah.
  const handleSourceSuratJalanChange = async (id) => {
    setField('sumberSuratJalanId', id ? Number(id) : null);
    if (!id) return;
    try {
      const res = await suratService.fetchQuotationDetail(id);
      if (res?.status !== 'ok' || !res.data) return;
      const d = res.data.data || {};
      setForm((prev) => ({
        ...prev,
        sumberSuratJalanId: Number(id),
        nomorSuratJalan: res.data.nomor || '',
        nomorPenawaran: d.nomorPenawaran || '',
        // Field SPK/PO dari Surat Jalan bila tersedia (opsional).
        nomorSPK: d.nomorPO || prev.nomorSPK,
        tanggalPelaksanaan: res.data.tanggal || prev.tanggalPelaksanaan,
        pihakPertamaNama: d.customerName || prev.pihakPertamaNama,
        pihakPertamaAlamat: d.customerAddress || prev.pihakPertamaAlamat,
        receiverName: d.receiverName || '',
        items: Array.isArray(res.data.items) && res.data.items.length
          ? res.data.items.map((it) => ({
              id: `item-${Math.random().toString(36).slice(2, 9)}`,
              nama_komponen: it.nama_komponen ?? '',
              spesifikasi: Array.isArray(it.spesifikasi) ? it.spesifikasi.join('\n') : '',
              volume: it.volume ?? '',
              satuan: it.satuan || 'Unit',
            }))
          : prev.items,
      }));
    } catch (err) {
      showNotice('error', err.message || 'Gagal memuat data Surat Jalan.');
    }
  };

  // ------------------------------------------------- signature / stamp
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

  // "Hapus" hanya melepas dari form; record di tb_surat_asset tidak dihapus.
  const handleImageRemove = useCallback((field) => {
    setForm((prev) => ({ ...prev, [field]: null }));
    setAssetIds((prev) => ({
      ...prev,
      [field === 'signatureImage' ? 'signature' : 'stamp']: null,
    }));
  }, []);

  // ---------------------------------------------------------------- items
  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));

  const removeItem = (index) =>
    setForm((prev) => {
      const items = prev.items.filter((_, i) => i !== index);
      return { ...prev, items: items.length ? items : [emptyItem()] };
    });

  const updateItem = (index, field, value) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));

  const moveItem = (index, direction) =>
    setForm((prev) => {
      const items = [...prev.items];
      const target = index + direction;
      if (target < 0 || target >= items.length) return prev;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...prev, items };
    });

  // ---------------------------------------------------------------- actions
  const validateForm = () => {
    const { valid, errors: validationErrors } = validateBast(form);
    setErrors(validationErrors);
    if (!valid) {
      showNotice('error', 'Lengkapi field wajib sebelum menyimpan berita acara.');
      return false;
    }
    return true;
  };

  const handleSaveAndDownload = async () => {
    if (isSubmitting || !validateForm()) return;
    setIsSubmitting(true);
    try {
      const payload = buildBastPayload(form, assetIds);
      const res = isEditMode
        ? await suratService.updateSuratJenis(editId, 'bast', payload)
        : await suratService.saveSuratJenis('bast', payload);
      if (res.status !== 'ok' || (!isEditMode && !res.data?.id)) {
        showNotice('error', res.message || 'Gagal menyimpan berita acara.');
        return;
      }

      // PDF dirender dari HTML Live Preview (Chrome headless backend)
      // sehingga hasilnya identik dengan preview di layar.
      const previewHtml = await buildPreviewHtml();
      const blob = await suratService.downloadQuotationPdfFromHtml(previewHtml);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${CFG.pdfPrefix}-${String(res.data.nomor || form.nomor || 'bast').replace(
        /[\\/:*?"<>|]+/g,
        '_'
      )}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showNotice(
        'success',
        isEditMode
          ? 'Berita acara diperbarui dan PDF berhasil diunduh.'
          : 'Berita acara tersimpan dan PDF berhasil diunduh.'
      );
    } catch (err) {
      showNotice('error', err.message || 'Gagal menyimpan berita acara / mengunduh PDF.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const partySection = (title, namaKey, alamatKey, errorKey) => (
    <Section title={title}>
      <div className="grid grid-cols-1 gap-4">
        <Input
          label="Nama Perusahaan"
          value={form[namaKey]}
          onChange={(e) => setField(namaKey, e.target.value)}
          error={errors[errorKey]}
          placeholder="Masukkan nama perusahaan"
        />
        <Textarea
          label="Alamat"
          rows={3}
          value={form[alamatKey]}
          onChange={(e) => setField(alamatKey, e.target.value)}
          placeholder="Masukkan alamat perusahaan"
        />
      </div>
    </Section>
  );

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
            <h2 className="page-title">
              {isEditMode ? `Edit ${CFG.label}` : `Buat ${CFG.label}`}
            </h2>
            <p className="page-subtitle">
              {isEditMode
                ? `Ubah ${CFG.label.toLowerCase()} dengan live preview`
                : `Susun ${CFG.label.toLowerCase()} dengan live preview`}
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
            {/* 1. Sumber Dokumen */}
            <Section
              title="Sumber Dokumen"
              subtitle="Ambil data dari Surat Jalan yang sudah dibuat."
            >
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    Ambil dari Surat Jalan
                  </label>
                  <select
                    value={form.sumberSuratJalanId || ''}
                    onChange={(e) => handleSourceSuratJalanChange(e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">-- Pilih Surat Jalan --</option>
                    {sjLoading ? (
                      <option disabled>Memuat...</option>
                    ) : (
                      suratJalanOptions.map((sj) => (
                        <option key={sj.id} value={sj.id}>
                          {sj.nomor} — {sj.pengirim || '-'}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <Input
                  label="Nomor Surat Jalan"
                  value={form.nomorSuratJalan}
                  onChange={(e) => setField('nomorSuratJalan', e.target.value)}
                  placeholder="Terisi otomatis jika sumber dipilih"
                />
                <Input
                  label="Nomor Penawaran"
                  value={form.nomorPenawaran}
                  onChange={(e) => setField('nomorPenawaran', e.target.value)}
                  placeholder="Masukkan nomor penawaran"
                />
              </div>
            </Section>

            {/* 2. Informasi Berita Acara */}
            <Section title="Informasi Berita Acara">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nomor Berita Acara"
                  value={form.nomor}
                  onChange={(e) => setField('nomor', e.target.value)}
                  error={errors.nomor}
                  placeholder="Nomor akan dibuat otomatis"
                  readOnly
                />
                <Input
                  label="Tanggal Berita Acara"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setField('tanggal', e.target.value)}
                  error={errors.tanggal}
                />
                <Input
                  label="Nomor SPK/PO"
                  value={form.nomorSPK}
                  onChange={(e) => setField('nomorSPK', e.target.value)}
                  error={errors.nomorSPK}
                  placeholder="Masukkan nomor SPK/PO"
                />
                <Input
                  label="Tanggal SPK/PO"
                  type="date"
                  value={form.tanggalSPK}
                  onChange={(e) => setField('tanggalSPK', e.target.value)}
                  placeholder="Masukkan tanggal SPK/PO"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Tanggal Pelaksanaan / Serah Terima"
                    type="date"
                    value={form.tanggalPelaksanaan}
                    onChange={(e) => setField('tanggalPelaksanaan', e.target.value)}
                    placeholder="Masukkan tanggal pelaksanaan"
                  />
                </div>
              </div>
            </Section>

            {/* 3. Pihak Pertama */}
            {partySection(
              'Pihak Pertama',
              'pihakPertamaNama',
              'pihakPertamaAlamat',
              'pihakPertamaNama'
            )}

            {/* 4. Pihak Kedua */}
            {partySection('Pihak Kedua', 'pihakKeduaNama', 'pihakKeduaAlamat', 'pihakKeduaNama')}

            {/* 5. Pekerjaan & Komponen */}
            <Section
              title="Pekerjaan & Komponen"
              subtitle="Tambahkan pekerjaan beserta volume dan satuan."
            >
              {errors.items && <p className="mb-3 text-sm text-error">{errors.items}</p>}
              <div className="space-y-4">
                {form.items.map((item, index) => {
                  const itemError = errors.itemErrors?.[index] || {};
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-4 bg-gray-50/40">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Pekerjaan {index + 1}
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
                            label="Nama Pekerjaan / Komponen"
                            value={item.nama_komponen}
                            onChange={(e) => updateItem(index, 'nama_komponen', e.target.value)}
                            error={itemError.nama_komponen}
                            placeholder="Masukkan nama pekerjaan"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Textarea
                            label="Spesifikasi / Detail Pekerjaan (satu poin per baris)"
                            rows={3}
                            value={item.spesifikasi}
                            onChange={(e) => updateItem(index, 'spesifikasi', e.target.value)}
                            placeholder="Masukkan spesifikasi, satu poin per baris"
                          />
                        </div>
                        <Input
                          label="Volume"
                          type="number"
                          min="0"
                          step="1"
                          value={item.volume}
                          onChange={(e) => updateItem(index, 'volume', e.target.value)}
                          placeholder="Masukkan volume"
                        />
                        <Select
                          label="Satuan"
                          value={item.satuan}
                          onChange={(e) => updateItem(index, 'satuan', e.target.value)}
                        >
                          <option value="">Pilih satuan</option>
                          {SATUAN_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addItem}>
                  Tambah Pekerjaan
                </Button>
              </div>
            </Section>

            {/* 6. Tanda Tangan */}
            <Section title="Tanda Tangan">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Nama Penandatangan Pihak Pertama"
                    value={form.pihakPertamaPenandatangan}
                    onChange={(e) => setField('pihakPertamaPenandatangan', e.target.value)}
                    placeholder="Kosongkan bila tidak diisi"
                  />
                </div>
                <Input
                  label="Nama Penandatangan Pihak Kedua"
                  value={form.signerName}
                  onChange={(e) => setField('signerName', e.target.value)}
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
                    description="Tampilkan gambar tanda tangan pada berita acara."
                  />
                  {form.useSignature && (
                    <div className="mt-3 space-y-4">
                      <Select
                        label="Tanda Tangan Ditampilkan Pada"
                        value={form.signatureSide || 'second'}
                        onChange={(e) => setField('signatureSide', e.target.value)}
                      >
                        <option value="second">PIHAK KEDUA</option>
                        <option value="first">PIHAK PERTAMA</option>
                      </Select>
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
                    description="Tampilkan gambar stempel pada berita acara."
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
                  <span className="hidden sm:inline text-xs text-text-muted">
                    A4 · {CFG.label}
                  </span>
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
                  <BastPreview form={form} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
