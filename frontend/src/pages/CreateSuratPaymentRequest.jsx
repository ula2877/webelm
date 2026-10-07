import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, FileDown, Loader2, Plus, Trash2, X } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Textarea, Select } from '../components/ui/Input';
import PaymentRequestPreview from '../components/PaymentRequestPreview';
import { buildPreviewHtml } from '../utils/quotationPrintHtml';
import { cn } from '../utils/helpers';
import * as suratService from '../services/surat';
import { validateImageFile, emptyItem } from '../utils/suratJenis';
import {
  buildPpbPayload,
  createInitialPpbForm,
  formFromPpbDetail,
  validatePpb,
  PPB_DEFAULT_ALAMAT,
  PPB_DEFAULT_PERUSAHAAN,
} from '../utils/paymentRequest';
import { ImageAssetField, Section, Toggle, ZoomControls } from './CreateSuratQuotation';

const ZOOM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 125, 150];
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
const SATUAN_OPTIONS = ['Unit', 'Paket', 'Set', 'PCS', 'OH', 'LS'];

const CFG = {
  routeBase: 'letters/payment-request',
  label: 'Surat Permohonan Pembayaran',
  pdfPrefix: 'Surat-Permohonan-Pembayaran',
  jenis: 'payment-request',
};

// Label sumber dokumen di dropdown "Sumber Dokumen".
const SUMBER_LABEL = {
  ba: '[BAST] ',
  inv: '[Invoice] ',
  sj: '[Surat Jalan] ',
  qr: '[Penawaran] ',
};

/**
 * Isi field tujuan hanya kalau masih kosong atau masih bernilai default,
 * supaya data yang sudah diketik user tidak tertimpa diam-diam.
 */
function isiJikaBelumDiisi(sekarang, dariSumber, nilaiDefault) {
  const s = String(sekarang || '').trim();
  if (s !== '' && s !== nilaiDefault) return s;
  return String(dariSumber || '').trim() || s;
}

// Halaman Create/Edit Surat Permohonan Pembayaran.
// Layout dua kolom (form kiri, Live Preview kanan) mengikuti modul
// Surat Penawaran / Invoice / Surat Jalan / BAST / Permohonan Pemeriksaan.
export default function CreateSuratPaymentRequest() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);

  const [isLoadingDetail, setIsLoadingDetail] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(() => createInitialPpbForm());
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
    setFitPercent(
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.floor((available / a4WidthPx) * 100)))
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

  // Nomor surat mengikuti tanggal (dihitung backend dari data aktif).
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
          setLoadError('Surat permohonan pembayaran tidak ditemukan.');
          return;
        }
        const { assetIds: ids, form: loaded } = formFromPpbDetail(res.data);
        setAssetIds(ids);
        setForm(loaded);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Gagal memuat data surat permohonan.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditMode, editId]);

  // ------------------------------------------------- Sumber dokumen (opsional)
  const [sumberOptions, setSumberOptions] = useState([]);
  const [sumberLoading, setSumberLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSumberLoading(true);
    Promise.all([
      suratService.fetchSurat({ search: '', jenis: 'bast', page: 1, perPage: 100 }),
      suratService.fetchSurat({ search: '', jenis: 'invoice', page: 1, perPage: 100 }),
      suratService.fetchSurat({ search: '', jenis: 'delivery-note', page: 1, perPage: 100 }),
      suratService.fetchSurat({ search: '', jenis: 'quotation', page: 1, perPage: 100 }),
    ])
      .then(([ba, inv, sj, qr]) => {
        if (cancelled) return;
        const opts = [];
        (ba?.data || []).forEach((r) =>
          opts.push({ kunci: 'ba', rawId: r.id, jenis: 'bast', nomor: r.nomor, nama: r.pengirim || '-' })
        );
        (inv?.data || []).forEach((r) =>
          opts.push({ kunci: 'inv', rawId: r.id, jenis: 'invoice', nomor: r.nomor, nama: r.pengirim || '-' })
        );
        (sj?.data || []).forEach((r) =>
          opts.push({ kunci: 'sj', rawId: r.id, jenis: 'delivery-note', nomor: r.nomor, nama: r.pengirim || '-' })
        );
        (qr?.data || []).forEach((r) =>
          opts.push({ kunci: 'qr', rawId: r.id, jenis: 'quotation', nomor: r.nomor, nama: r.pengirim || '-' })
        );
        setSumberOptions(opts);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSumberLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Pilih sumber -> isi tujuan, identitas, dan komponen.
   * PENTING: nomor sumber TIDAK pernah ditulis ke kolom nomor yang salah.
   *  - BAST  -> hanya mengisi Nomor BAST / Tanggal BAST.
   *  - Invoice / Surat Jalan / Penawaran -> TIDAK menyentuh Nomor BAST.
   *  - Nomor surat modul ini sendiri tetap hasil hitungan backend.
   */
  const handleSumberChange = async (value) => {
    if (!value) {
      setForm((prev) => ({ ...prev, sumberId: null, sumberJenis: '' }));
      return;
    }
    const [kunci, rawId] = value.split(':');
    const opsi = sumberOptions.find((o) => o.kunci === kunci && String(o.rawId) === rawId);
    const jenis = opsi?.jenis || 'bast';
    setField('sumberId', Number(rawId));
    setField('sumberJenis', jenis);
    try {
      const res = await suratService.fetchQuotationDetail(rawId);
      if (res?.status !== 'ok' || !res.data) return;
      const d = res.data.data || {};
      const items =
        Array.isArray(res.data.items) && res.data.items.length
          ? res.data.items.map((it) => ({
              id: `item-${Math.random().toString(36).slice(2, 9)}`,
              nama_komponen: it.nama_komponen ?? '',
              spesifikasi: Array.isArray(it.spesifikasi) ? it.spesifikasi.join('\n') : '',
              volume: it.volume ?? '',
              satuan: it.satuan || 'Unit',
            }))
          : null;

      setForm((prev) => ({
        ...prev,
        sumberId: Number(rawId),
        sumberJenis: jenis,
        // Nomor BAST hanya dari dokumen bertipe BAST.
        nomorBAST:
          jenis === 'bast' ? res.data.nomor || prev.nomorBAST : prev.nomorBAST,
        tanggalBAST:
          jenis === 'bast' ? res.data.tanggal || prev.tanggalBAST : prev.tanggalBAST,
        // Nomor penawaran dari sumber yang memang punya field itu.
        nomorPenawaran: d.nomorPenawaran || prev.nomorPenawaran,
        // SPK/PO mengikuti sumber; BAST tidak membawa nomor SPK baru.
        nomorSPK: d.nomorPO || d.nomorSPK || prev.nomorSPK,
        tujuanInstansi: isiJikaBelumDiisi(
          prev.tujuanInstansi,
          d.tujuanInstansi || d.customerName || res.data.pengirim,
          ''
        ),
        tujuanJabatan: isiJikaBelumDiisi(prev.tujuanJabatan, d.tujuanJabatan, ''),
        tujuanAlamat: isiJikaBelumDiisi(
          prev.tujuanAlamat,
          d.tujuanAlamat || d.customerAddress,
          ''
        ),
        namaPekerjaan: isiJikaBelumDiisi(prev.namaPekerjaan, d.namaPekerjaan, ''),
        // Pada BAST, pihak kedua = penyedia (CV. Elmech ...) yang menandatangani.
        perusahaanNama: isiJikaBelumDiisi(
          prev.perusahaanNama,
          d.pihakKeduaNama || d.perusahaanNama,
          PPB_DEFAULT_PERUSAHAAN
        ),
        perusahaanAlamat: isiJikaBelumDiisi(
          prev.perusahaanAlamat,
          d.pihakKeduaAlamat || d.perusahaanAlamat,
          PPB_DEFAULT_ALAMAT
        ),
        items: items || prev.items,
      }));
    } catch (err) {
      showNotice('error', err.message || 'Gagal memuat data sumber dokumen.');
    }
  };

  // ------------------------------------------- dokumen pendukung (list teks)
  const updateDokumen = (index, value) =>
    setForm((prev) => ({
      ...prev,
      dokumenPendukung: prev.dokumenPendukung.map((d, i) => (i === index ? value : d)),
    }));

  const addDokumen = () =>
    setForm((prev) => ({ ...prev, dokumenPendukung: [...prev.dokumenPendukung, ''] }));

  const removeDokumen = (index) =>
    setForm((prev) => ({
      ...prev,
      dokumenPendukung: prev.dokumenPendukung.filter((_, i) => i !== index),
    }));

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
    const { valid, errors: validationErrors } = validatePpb(form);
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
      const payload = buildPpbPayload(form, assetIds);
      const res = isEditMode
        ? await suratService.updateSuratJenis(editId, CFG.jenis, payload)
        : await suratService.saveSuratJenis(CFG.jenis, payload);
      if (res.status !== 'ok' || (!isEditMode && !res.data?.id)) {
        showNotice('error', res.message || 'Gagal menyimpan surat permohonan pembayaran.');
        return;
      }

      // PDF dari HTML Live Preview (Chrome headless) -> identik dengan preview.
      const previewHtml = await buildPreviewHtml();
      const blob = await suratService.downloadQuotationPdfFromHtml(previewHtml);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const nomor = String(res.data.nomor || form.nomor || 'permohonan').replace(
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
          ? 'Surat permohonan pembayaran diperbarui dan PDF berhasil diunduh.'
          : 'Surat permohonan pembayaran tersimpan dan PDF berhasil diunduh.'
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
            <h2 className="page-title">
              {isEditMode ? `Edit ${CFG.label}` : `Buat ${CFG.label}`}
            </h2>
            <p className="page-subtitle">
              {isEditMode
                ? 'Ubah surat permohonan pembayaran dengan live preview'
                : 'Susun surat permohonan pembayaran dengan live preview'}
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
            {/* 1. Sumber Dokumen (opsional) */}
            <Section
              title="Sumber Dokumen"
              subtitle="Opsional — isi otomatis dari BAST, Invoice, Surat Jalan, atau Penawaran."
            >
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    Ambil dari Dokumen
                  </label>
                  <select
                    value={form.sumberId && form.sumberJenis ? `${form.sumberJenis === 'bast' ? 'ba' : form.sumberJenis === 'invoice' ? 'inv' : form.sumberJenis === 'delivery-note' ? 'sj' : 'qr'}:${form.sumberId}` : ''}
                    onChange={(e) => handleSumberChange(e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">-- Tanpa sumber dokumen --</option>
                    {sumberLoading ? (
                      <option disabled>Memuat...</option>
                    ) : (
                      sumberOptions.map((o) => (
                        <option key={o.id} value={`${o.kunci}:${o.rawId}`}>
                          {SUMBER_LABEL[o.kunci]}
                          {o.nomor} — {o.nama}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <Input
                  label="Nomor Penawaran"
                  value={form.nomorPenawaran}
                  onChange={(e) => setField('nomorPenawaran', e.target.value)}
                  placeholder="Terisi otomatis jika sumber dipilih"
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
                  placeholder="Nomor akan dibuat otomatis"
                  readOnly
                />
                <Input
                  label="Tanggal Surat"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setField('tanggal', e.target.value)}
                  error={errors.tanggal}
                />
                <Input
                  label="Lampiran"
                  value={form.lampiran}
                  onChange={(e) => setField('lampiran', e.target.value)}
                  placeholder="Contoh: 1"
                />
                <Input
                  label="Perihal"
                  value={form.perihal}
                  onChange={(e) => setField('perihal', e.target.value)}
                  placeholder="Perihal surat"
                />
              </div>
            </Section>

            {/* 3. Tujuan Surat */}
            <Section title="Tujuan Surat">
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Jabatan Penerima"
                  value={form.tujuanJabatan}
                  onChange={(e) => setField('tujuanJabatan', e.target.value)}
                  placeholder="Contoh: Kepala Pangkalan PSDKP Benoa"
                />
                <Input
                  label="Nama Instansi"
                  value={form.tujuanInstansi}
                  onChange={(e) => setField('tujuanInstansi', e.target.value)}
                  error={errors.tujuanInstansi}
                  placeholder="Masukkan nama instansi tujuan"
                />
              </div>
            </Section>

            {/* 4. Informasi Pekerjaan */}
            <Section
              title="Informasi Pekerjaan"
              subtitle="Nomor SPK & BAST boleh dikosongkan; klausa yang tidak diisi dilewati di surat."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Nama Pekerjaan"
                    value={form.namaPekerjaan}
                    onChange={(e) => setField('namaPekerjaan', e.target.value)}
                    error={errors.namaPekerjaan}
                    placeholder="Masukkan nama pekerjaan"
                  />
                </div>
                <Input
                  label="Nomor SPK/PO"
                  value={form.nomorSPK}
                  onChange={(e) => setField('nomorSPK', e.target.value)}
                  placeholder="Masukkan nomor SPK/PO (opsional)"
                />
                <Input
                  label="Tanggal SPK/PO"
                  type="date"
                  value={form.tanggalSPK}
                  onChange={(e) => setField('tanggalSPK', e.target.value)}
                />
                <Input
                  label="Nomor BAST"
                  value={form.nomorBAST}
                  onChange={(e) => setField('nomorBAST', e.target.value)}
                  placeholder="Terisi otomatis dari sumber BAST"
                />
                <Input
                  label="Tanggal BAST"
                  type="date"
                  value={form.tanggalBAST}
                  onChange={(e) => setField('tanggalBAST', e.target.value)}
                />
              </div>
            </Section>

            {/* 5. Identitas Penyedia */}
            <Section
              title="Identitas Penyedia"
              subtitle="Ditampilkan sebagai blok 'Nama Perusahaan' dan 'Alamat' di surat."
            >
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Nama Perusahaan"
                  value={form.perusahaanNama}
                  onChange={(e) => setField('perusahaanNama', e.target.value)}
                  placeholder={PPB_DEFAULT_PERUSAHAAN}
                />
                <Textarea
                  label="Alamat"
                  rows={2}
                  value={form.perusahaanAlamat}
                  onChange={(e) => setField('perusahaanAlamat', e.target.value)}
                  placeholder={PPB_DEFAULT_ALAMAT}
                />
              </div>
            </Section>

            {/* 6. Data Pekerjaan */}
            <Section
              title="Data Pekerjaan"
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
                            label="Spesifikasi (satu poin per baris)"
                            rows={3}
                            value={item.spesifikasi}
                            onChange={(e) => updateItem(index, 'spesifikasi', e.target.value)}
                            placeholder={'Masukkan spesifikasi, satu poin per baris\nContoh: Kontroler GSM'}
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

            {/* 7. Dokumen Pendukung */}
            <Section
              title="Dokumen Pendukung"
              subtitle="Daftar dokumen yang dilampirkan; poin terakhir diakhiri titik."
            >
              <div className="space-y-2">
                {form.dokumenPendukung.length === 0 && (
                  <p className="text-sm text-text-muted italic">
                    Belum ada dokumen pendukung.
                  </p>
                )}
                {form.dokumenPendukung.map((d, i) => (
                  <div key={`dok-${i}`} className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-text-muted pt-2.5 w-4 shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <Input
                        value={d}
                        onChange={(e) => updateDokumen(i, e.target.value)}
                        placeholder="Nama dokumen pendukung"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDokumen(i)}
                      className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                      title="Hapus"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Plus}
                  onClick={addDokumen}
                >
                  Tambah Dokumen
                </Button>
              </div>
            </Section>

            {/* 8. Tanda Tangan */}
            <Section title="Tanda Tangan">
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
                  <span className="hidden sm:inline text-xs text-text-muted">A4</span>
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
                  <PaymentRequestPreview form={form} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
