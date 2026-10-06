// ============================================
// INVOICE - helpers (pola sama dengan quotation)
// ============================================
import {
  buildQuotationTotals,
  computeItemSubtotal,
  normalizeSpecifications,
  formatDocNumber,
  formatLongDateID,
  emptyItem,
} from './quotation';

export {
  computeItemSubtotal,
  normalizeSpecifications,
  formatDocNumber,
  formatLongDateID,
  emptyItem,
};
export { rupiah, validateImageFile } from './quotation';

export const INVOICE_PREFIX = 'INV';

// Perihal tetap untuk semua invoice. Field tidak diedit
// user lagi - nilai tetap dikirim ke backend.
export const INVOICE_SUBJECT = 'Invoice';

// Informasi pembayaran paten (data tetap untuk SEMUA
// invoice). Tidak dapat diubah user; ditampilkan pada
// Live Preview dan PDF invoice.
export const INVOICE_BANK = {
  bankName: 'BNI',
  bankAccount: '1121547175',
  bankOwner: 'ELMECH TECHNOLOGY INDONESIA',
  bankBranch: 'Tanjung Perak, Surabaya',
};

export function buildInvoiceTotals(items, usePPN, ppnRate) {
  // DP tidak dipakai di invoice.
  return buildQuotationTotals(items, usePPN, ppnRate, false, 0);
}

export function createInitialInvoiceForm() {
  const d = new Date();
  return {
    nomor: '',
    tanggal: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    customerName: '',
    customerAddress: '',
    nomorPenawaran: '',
    nomorPo: '',
    sumberQuotationId: null,
    items: [emptyItem()],
    usePPN: true,
    ppnRate: 11,
    useSignature: false,
    signatureImage: null,
    signatureX: 0,
    signatureY: 0,
    signatureZoom: 100,
    useStamp: false,
    stampImage: null,
    stampX: 0,
    stampY: 25,
    stampZoom: 100,
    companyName: 'CV. Elmech Technology Indonesia',
    signerName: 'Muhammad Taufiq Rahman',
    signerTitle: 'Direktur',
  };
}

export function buildInvoicePayload(form, assetIds = {}) {
  const items = (form.items || []).map((item, index) => ({
    no_urut: index + 1,
    nama_komponen: item.nama_komponen || '',
    spesifikasi: normalizeSpecifications(item.spesifikasi),
    volume: Number(item.volume) || 0,
    satuan: item.satuan || '',
    harga_satuan: Number(item.harga_satuan) || 0,
    subtotal: computeItemSubtotal(item),
  }));

  const position = (x, y, zoomPercent) => ({
    x: Number(x) || 0,
    y: Number(y) || 0,
    zoom: (Number(zoomPercent) || 100) / 100,
  });

  return {
    nomor: form.nomor || '',
    tanggal: form.tanggal || '',
    subject: INVOICE_SUBJECT,
    customerName: form.customerName || '',
    customerAddress: form.customerAddress || '',
    nomorPenawaran: form.nomorPenawaran || '',
    nomorPo: form.nomorPo || '',
    sumberQuotationId: form.sumberQuotationId || null,
    usePPN: !!form.usePPN,
    ppnRate: Number(form.ppnRate) || 0,
    useSignature: !!form.useSignature,
    signature_asset_id: assetIds.signature || null,
    signaturePosition: form.useSignature
      ? position(form.signatureX, form.signatureY, form.signatureZoom)
      : null,
    useStamp: !!form.useStamp,
    stamp_asset_id: assetIds.stamp || null,
    stampPosition: form.useStamp
      ? position(form.stampX, form.stampY, form.stampZoom)
      : null,
    signature: {
      companyName: form.companyName || '',
      signerName: form.signerName || '',
      signerTitle: form.signerTitle || '',
    },
    bankName: INVOICE_BANK.bankName,
    bankAccount: INVOICE_BANK.bankAccount,
    bankOwner: INVOICE_BANK.bankOwner,
    bankBranch: INVOICE_BANK.bankBranch,
    notes: (form.notes || []).filter((n) => String(n).trim() !== ''),
    items,
  };
}

export function validateInvoice(form) {
  const errors = {};
  if (!String(form.nomor || '').trim()) errors.nomor = 'Nomor invoice wajib diisi.';
  if (!String(form.tanggal || '').trim()) errors.tanggal = 'Tanggal invoice wajib diisi.';
  if (!String(form.customerName || '').trim()) errors.customerName = 'Nama instansi/perusahaan wajib diisi.';
  if (!String(form.customerAddress || '').trim()) errors.customerAddress = 'Alamat penerima wajib diisi.';
  if (!String(form.signerName || '').trim()) errors.signerName = 'Nama penandatangan wajib diisi.';

  const items = form.items || [];
  if (items.length === 0) {
    errors.items = 'Minimal satu komponen harus ditambahkan.';
  } else {
    const itemErrors = items.map((item) => {
      const e = {};
      if (!String(item.nama_komponen || '').trim()) e.nama_komponen = 'Nama komponen wajib diisi.';
      if (!(Number(item.volume) > 0)) e.volume = 'Volume harus lebih dari 0.';
      if (!String(item.satuan || '').trim()) e.satuan = 'Satuan wajib dipilih.';
      if (!(Number(item.harga_satuan) > 0)) e.harga_satuan = 'Harga satuan harus lebih dari 0.';
      return e;
    });
    if (itemErrors.some((e) => Object.keys(e).length > 0)) {
      errors.itemErrors = itemErrors;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function formFromInvoiceDetail(detail) {
  if (!detail) return null;
  const d = detail.data || {};
  const pos = (raw) => {
    const p = raw && typeof raw === 'object' ? raw : {};
    return {
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      zoom: Math.round((Number(p.zoom) || 1) * 100),
    };
  };
  const sigPos = pos(detail.posisi_ttd ?? d.signaturePosition);
  const stampPos = pos(detail.posisi_stempel ?? d.stampPosition);

  return {
    nomor: detail.nomor || '',
    tanggal: detail.tanggal || '',
    customerName: d.customerName ?? '',
    customerAddress: d.customerAddress ?? '',
    nomorPenawaran: d.nomorPenawaran ?? '',
    nomorPo: d.nomorPo ?? '',
    sumberQuotationId: d.sumberQuotationId ?? null,
    usePPN: !!d.usePPN,
    ppnRate: d.ppnRate ?? '',
    notes: Array.isArray(d.notes) && d.notes.length ? d.notes : [''],
    useSignature: !!d.useSignature,
    signatureImage: d.signatureImage ?? null,
    signatureX: sigPos.x,
    signatureY: sigPos.y,
    signatureZoom: sigPos.zoom,
    useStamp: !!d.useStamp,
    stampImage: d.stampImage ?? null,
    stampX: stampPos.x,
    stampY: stampPos.y,
    stampZoom: stampPos.zoom,
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
  };
}
