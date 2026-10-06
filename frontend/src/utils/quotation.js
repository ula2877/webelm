// ============================================
// SURAT PENAWARAN - quotation builder helpers
// ============================================
//
// Purely frontend. No API call, no database write. These helpers define how a
// form state maps onto the EXISTING data shape already present in the project:
//
//   - tb_surat.data (longtext JSON)  -> quotation meta (see buildQuotationPayload)
//   - tb_surat_item columns          -> quotation line items (see buildItemPayload)
//   - tb_nomor_surat_sequence format -> nomor surat (PNR/01101/ELMECH/2026)
//
// The mapping is intentionally 1:1 with the columns/keys that already exist, so
// a future write endpoint can persist this payload without any schema change.

import { formatCurrency } from './helpers';

export const QUOTATION_PREFIX = 'PNR';
export const DEFAULT_COMPANY = 'CV. Elmech Technology Indonesia';
export const DEFAULT_URUTAN = 1101; // matches the existing PNR/01101/ELMECH/2026 sample

/** Pad the daily sequence into the ELMECH nomor format. */
export function formatNomorSurat(urutan, dateStr) {
  const year = dateStr ? new Date(dateStr).getFullYear() : new Date().getFullYear();
  const seq = String(Number(urutan) || DEFAULT_URUTAN).padStart(5, '0');
  return `${QUOTATION_PREFIX}/${seq}/ELMECH/${year}`;
}

/** subtotal = volume x harga_satuan (never NaN). */
export function computeItemSubtotal(item) {
  const volume = Number(item?.volume) || 0;
  const harga = Number(item?.harga_satuan) || 0;
  return volume * harga;
}

/** Totals for the "Perhitungan Harga" section. */
export function buildQuotationTotals(items, usePPN, ppnRate, useDP = false, dpRate = 0) {
  const total = (items || []).reduce((sum, item) => sum + computeItemSubtotal(item), 0);
  const rate = usePPN ? Number(ppnRate) || 0 : 0;
  const ppn = Math.round((total * rate) / 100);
  const grandTotal = total + ppn;
  // DP is computed from Grand Total (after PPN) and is NOT subtracted from it.
  const dpPercent = useDP ? Number(dpRate) || 0 : 0;
  const dp = Math.round((grandTotal * dpPercent) / 100);
  const remaining = grandTotal - dp;
  return { total, ppn, ppnRate: rate, grandTotal, dp, dpRate: dpPercent, remaining };
}

/**
 * Map form state -> payload POST /api/surat/quotation.
 *
 * `assetIds` = { signature: id_asset|null, stamp: id_asset|null } dari
 * tb_surat_asset (upload baru atau pilih asset existing). Gambar TIDAK
 * disimpan di tb_surat - hanya ID asset-nya (id_asset_ttd/id_asset_stempel).
 *
 * Posisi disimpan dengan zoom sebagai multiplier (konvensi baris existing
 * di tb_surat: 1.58 dst), bukan persen seperti di state form.
 */
export function buildQuotationPayload(form, assetIds = {}) {
  const items = (form.items || []).map((item, index) => ({
    no_urut: index + 1,
    nama_komponen: item.nama_komponen || '',
    spesifikasi: normalizeSpecifications(item.spesifikasi),
    volume: Number(item.volume) || 0,
    satuan: item.satuan || '',
    harga_satuan: Number(item.harga_satuan) || 0,
    subtotal: computeItemSubtotal(item),
  }));

  const totals = buildQuotationTotals(form.items, form.usePPN, form.ppnRate, form.useDP, form.dpRate);

  // percent (state form) -> multiplier (konvensi existing di tb_surat)
  const position = (x, y, zoomPercent) => ({
    x: Number(x) || 0,
    y: Number(y) || 0,
    zoom: (Number(zoomPercent) || 100) / 100,
  });

  return {
    jenis: 'quotation',
    nomor: form.nomor || '',
    tanggal: form.tanggal || '',
    city: form.city || '',
    attachment: form.attachment || '',
    subject: form.subject || '',
    customerName: form.customerName || '',
    customerAddress: form.customerAddress || '',
    systemName: form.systemName || '',
    usePPN: !!form.usePPN,
    ppnRate: Number(form.ppnRate) || 0,
    useDP: !!form.useDP,
    dpRate: Number(form.dpRate) || 0,
    useSignature: !!form.useSignature,
    useStamp: !!form.useStamp,
    // ID asset dari tb_surat_asset (bukan BLOB, bukan URL).
    signature_asset_id: assetIds.signature || null,
    stamp_asset_id: assetIds.stamp || null,
    signaturePosition: form.useSignature
      ? position(form.signatureX, form.signatureY, form.signatureZoom)
      : null,
    stampPosition: form.useStamp
      ? position(form.stampX, form.stampY, form.stampZoom)
      : null,
    signature: {
      companyName: form.companyName || '',
      signerName: form.signerName || '',
      signerTitle: form.signerTitle || '',
    },
    notes: (form.notes || []).filter((n) => String(n).trim() !== ''),
    total: totals.grandTotal,
    items,
  };
}

/** Normalize a textarea (one spec per line) into the JSON array the schema uses. */
export function normalizeSpecifications(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A blank item, matching tb_surat_item columns. */
export function emptyItem() {
  return {
    id: `item-${Math.random().toString(36).slice(2, 9)}`,
    nama_komponen: '',
    spesifikasi: '',
    volume: '',
    satuan: '',
    harga_satuan: '',
  };
}

export function createInitialForm() {
  return {
    nomor: '',
    tanggal: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })(),
    city: 'Surabaya',
    attachment: '',
    subject: '',
    customerName: '',
    customerAddress: '',
    systemName: '',
    items: [emptyItem()],
    usePPN: true,
    ppnRate: 11,
    useDP: false,
    dpRate: '',
    notes: [''],
    // Signature / stamp - independent toggles + positions (frontend-only images).
    useSignature: false,
    useStamp: false,
    signatureImage: null,
    stampImage: null,
    signatureX: 0,
    signatureY: 0,
    signatureZoom: 100,
    stampX: 0,
    stampY: 0,
    stampZoom: 100,
    companyName: DEFAULT_COMPANY,
    signerName: 'Muhammad Taufiq Rahman',
    signerTitle: 'Direktur',
  };
}

/** Accepted image mime types for signature/stamp uploads. */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

/** Validate an uploaded signature/stamp file. Returns an error string or null. */
export function validateImageFile(file) {
  if (!file) return 'File tidak ditemukan.';
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const okType = ALLOWED_IMAGE_TYPES.includes(type) || /\.(png|jpe?g|webp)$/.test(name);
  if (!okType) return 'Format file harus PNG, JPG, JPEG, atau WEBP.';
  return null;
}

// ------------------------------------------------------------------ document fmt
// Formatting used by the printed letter, matching the reference document
// (plain grouped numbers, no "Rp" prefix, Indonesian long date).

/** "6,500,000" — plain grouped number like the reference document. */
export function formatDocNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

/** "14 September 2026" — Indonesian long date. */
export function formatLongDateID(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

// ------------------------------------------------------------------ local draft
// Frontend-only placeholder for "Simpan Draft". The project has no draft
// endpoint and the database is read-only, so the draft lives in localStorage
// until a real endpoint is approved.

const DRAFT_KEY = 'elmech_quotation_draft';

export function saveDraft(form) {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), form })
    );
    return true;
  } catch {
    return false;
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ validation
// Mirrors the shape the backend would validate; not a substitute for it.
export function validateQuotation(form) {
  const errors = {};
  if (!String(form.nomor || '').trim()) errors.nomor = 'Nomor surat wajib diisi.';
  if (!String(form.tanggal || '').trim()) errors.tanggal = 'Tanggal surat wajib diisi.';
  if (!String(form.customerName || '').trim()) errors.customerName = 'Nama instansi/perusahaan wajib diisi.';
  if (!String(form.customerAddress || '').trim()) errors.customerAddress = 'Alamat penerima wajib diisi.';
  if (!String(form.subject || '').trim()) errors.subject = 'Hal / judul surat wajib diisi.';
  if (!String(form.signerName || '').trim()) errors.signerName = 'Nama penandatangan wajib diisi.';

  const items = form.items || [];
  if (items.length === 0) {
    errors.items = 'Minimal satu komponen penawaran harus ditambahkan.';
  } else {
    const itemErrors = items.map((item) => {
      const e = {};
      if (!String(item.nama_komponen || '').trim()) e.nama_komponen = 'Nama komponen wajib diisi.';
      if (!(Number(item.volume) > 0)) e.volume = 'Volume harus lebih dari 0.';
      if (!String(item.satuan || '').trim()) e.satuan = 'Satuan wajib diisi.';
      if (!(Number(item.harga_satuan) > 0)) e.harga_satuan = 'Harga satuan harus lebih dari 0.';
      return e;
    });
    if (itemErrors.some((e) => Object.keys(e).length > 0)) {
      errors.itemErrors = itemErrors;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Format a number as Rupiah, tolerating empty/NaN inputs. */
export function rupiah(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return formatCurrency(0);
  return formatCurrency(n);
}

/**
 * Map hasil GET /api/surat/{id}/detail ke form state yang dipakai
 * QuotationPreview/CreateSuratQuotation. Dipakai oleh mode edit dan
 * halaman view agar datanya sama persis.
 */
export function formFromQuotationDetail(detail) {
  if (!detail) return null;
  const d = detail.data || {};
  const pos = (raw) => {
    const p = raw && typeof raw === 'object' ? raw : {};
    return {
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      // backend menyimpan multiplier (1.58); form memakai persen
      zoom: Math.round((Number(p.zoom) || 1) * 100),
    };
  };
  const sigPos = pos(detail.posisi_ttd ?? d.signaturePosition);
  const stmPos = pos(detail.posisi_stempel ?? d.stampPosition);

  return {
    nomor: detail.nomor || '',
    tanggal: detail.tanggal || '',
    city: d.city ?? '',
    attachment: d.attachment ?? '',
    subject: d.subject ?? '',
    customerName: d.customerName ?? '',
    customerAddress: d.customerAddress ?? '',
    systemName: d.systemName ?? '',
    usePPN: !!d.usePPN,
    ppnRate: d.ppnRate ?? '',
    useDP: !!d.useDP,
    dpRate: d.dpRate ?? '',
    notes: Array.isArray(d.notes) && d.notes.length ? d.notes : [''],
    useSignature: !!d.useSignature || !!detail.id_asset_ttd,
    useStamp: !!d.useStamp || !!detail.id_asset_stempel,
    signatureImage: d.signatureImage ?? null,
    stampImage: d.stampImage ?? null,
    signatureX: sigPos.x,
    signatureY: sigPos.y,
    signatureZoom: sigPos.zoom,
    stampX: stmPos.x,
    stampY: stmPos.y,
    stampZoom: stmPos.zoom,
    companyName: d.signature?.companyName ?? '',
    signerName: d.signature?.signerName ?? '',
    signerTitle: d.signature?.signerTitle ?? '',
    items: Array.isArray(detail.items) && detail.items.length
      ? detail.items.map((it) => ({
          id: `item-${Math.random().toString(36).slice(2, 9)}`,
          nama_komponen: it.nama_komponen ?? '',
          spesifikasi: Array.isArray(it.spesifikasi) ? it.spesifikasi.join('\n') : '',
          volume: it.volume ?? '',
          satuan: it.satuan ?? '',
          harga_satuan: it.harga_satuan ?? '',
        }))
      : [emptyItem()],
    useSignatureAssetId: detail.id_asset_ttd ?? null,
    useStampAssetId: detail.id_asset_stempel ?? null,
  };
}
