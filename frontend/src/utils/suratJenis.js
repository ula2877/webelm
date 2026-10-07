// ============================================
// SURAT JENIS GENERIK - helpers
// (pola sama dengan Surat Penawaran / Invoice)
// Jenis: delivery-note, bast, inspection-request,
// payment-request, kuitansi. Data tersimpan di
// tb_surat (kolom jenis) + tb_surat_item,
// detail JSON di kolom `data` tb_surat.
// ============================================
import {
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

// Konfigurasi per jenis surat.
export const SURAT_JENIS = {
  'delivery-note': {
    label: 'Surat Jalan',
    routeBase: 'delivery-note',
    searchPlaceholder: 'Cari surat jalan...',
    pdfPrefix: 'Surat-Jalan',
    nomorPrefix: 'SJ',
    docTitle: 'SURAT JALAN',
    emptyTitle: 'Tidak ada surat jalan',
  },
  bast: {
    label: 'Berita Acara Serah Terima',
    routeBase: 'handover',
    searchPlaceholder: 'Cari berita acara...',
    pdfPrefix: 'BAST',
    nomorPrefix: 'BA',
    docTitle: 'BERITA ACARA SERAH TERIMA',
    emptyTitle: 'Tidak ada berita acara',
  },
  'inspection-request': {
    label: 'Surat Permohonan Pemeriksaan Hasil Pekerjaan',
    routeBase: 'inspection-request',
    searchPlaceholder: 'Cari surat permohonan pemeriksaan...',
    pdfPrefix: 'Surat-Permohonan-Pemeriksaan',
    nomorPrefix: 'PP',
    docTitle: 'SURAT PERMOHONAN PEMERIKSAAN',
    emptyTitle: 'Tidak ada surat permohonan pemeriksaan',
  },
  'payment-request': {
    label: 'Surat Permohonan Pembayaran',
    routeBase: 'payment-request',
    searchPlaceholder: 'Cari surat permohonan pembayaran...',
    pdfPrefix: 'Surat-Permohonan-Pembayaran',
    nomorPrefix: 'PB',
    docTitle: 'SURAT PERMOHONAN PEMBAYARAN',
    emptyTitle: 'Tidak ada surat permohonan pembayaran',
  },
  kuitansi: {
    label: 'Kuitansi',
    routeBase: 'receipt',
    searchPlaceholder: 'Cari kuitansi...',
    pdfPrefix: 'Kuitansi',
    nomorPrefix: 'KWT',
    docTitle: 'KUITANSI',
    emptyTitle: 'Tidak ada kuitansi',
  },
};

export function suratJenisConfig(jenisKey) {
  return (
    SURAT_JENIS[jenisKey] || {
      label: 'Surat',
      routeBase: jenisKey,
      searchPlaceholder: 'Cari surat...',
      pdfPrefix: 'Surat',
      nomorPrefix: 'SRT',
      docTitle: 'SURAT',
      emptyTitle: 'Tidak ada surat',
    }
  );
}

export function buildSuratJenisTotals(items) {
  return {
    total: (items || []).reduce(
      (sum, item) => sum + (computeItemSubtotal(item) || 0),
      0
    ),
  };
}

export function createInitialSuratJenisForm() {
  const d = new Date();
  return {
    nomor: '',
    tanggal: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`,
    city: 'Surabaya',
    subject: '',
    customerName: '',
    customerAddress: '',
    nomorPenawaran: '',
    nomorPO: '',
    receiverName: '',
    items: [emptyItem()],
    notes: [''],
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

export function buildSuratJenisPayload(form, assetIds = {}) {
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
    city: form.city || '',
    subject: form.subject || '',
    customerName: form.customerName || '',
    customerAddress: form.customerAddress || '',
    nomorPenawaran: form.nomorPenawaran || '',
    nomorPO: form.nomorPO || '',
    receiverName: form.receiverName || '',
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
    notes: (form.notes || []).filter((n) => String(n).trim() !== ''),
    items,
  };
}

export function validateSuratJenis(form, isDeliveryNote = false) {
  const errors = {};
  if (!String(form.nomor || '').trim()) errors.nomor = 'Nomor surat wajib diisi.';
  if (!String(form.tanggal || '').trim()) errors.tanggal = 'Tanggal surat wajib diisi.';
  if (!isDeliveryNote && !String(form.subject || '').trim()) {
    errors.subject = 'Perihal surat wajib diisi.';
  }
  if (!String(form.customerName || '').trim()) {
    errors.customerName = 'Nama instansi/perusahaan wajib diisi.';
  }
  if (!String(form.customerAddress || '').trim()) {
    errors.customerAddress = 'Alamat penerima wajib diisi.';
  }
  if (!String(form.signerName || '').trim()) {
    errors.signerName = 'Nama penandatangan wajib diisi.';
  }

  const items = form.items || [];
  if (items.length === 0) {
    errors.items = 'Minimal satu komponen harus ditambahkan.';
  } else {
    const itemErrors = items.map((item) => {
      const e = {};
      if (!String(item.nama_komponen || '').trim()) e.nama_komponen = 'Nama komponen wajib diisi.';
      if (!(Number(item.volume) > 0)) e.volume = 'Volume harus lebih dari 0.';
      if (!String(item.satuan || '').trim()) e.satuan = 'Satuan wajib dipilih.';
      if (!isDeliveryNote && !(Number(item.harga_satuan) > 0)) e.harga_satuan = 'Harga satuan harus lebih dari 0.';
      return e;
    });
    if (itemErrors.some((e) => Object.keys(e).length > 0)) {
      errors.itemErrors = itemErrors;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function formFromSuratJenisDetail(detail) {
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
    city: d.city ?? '',
    subject: d.subject ?? '',
    customerName: d.customerName ?? '',
    customerAddress: d.customerAddress ?? '',
    nomorPenawaran: d.nomorPenawaran ?? '',
    nomorPO: d.nomorPO ?? '',
    receiverName: d.receiverName ?? '',
    items:
      Array.isArray(detail.items) && detail.items.length
        ? detail.items.map((it) => ({
            id: `item-${Math.random().toString(36).slice(2, 9)}`,
            nama_komponen: it.nama_komponen ?? '',
            spesifikasi: Array.isArray(it.spesifikasi) ? it.spesifikasi.join('\n') : '',
            volume: it.volume ?? '',
            satuan: it.satuan ?? '',
            harga_satuan: it.harga_satuan ?? '',
          }))
        : [emptyItem()],
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
  };
}
