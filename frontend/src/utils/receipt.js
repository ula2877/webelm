// ============================================
// KWITANSI - helpers khusus modul ini.
//
// Berbeda dengan surat A4, kwitansi memakai background cetakan fisik
// (23 cm x 9 cm) dan teks di-overlay dengan koordinat cm.
// Semua posisi teks didefinisikan di CM (bukan pixel) supaya preview di
// layar tetap benar pada resolusi berapa pun dan PDF tetap 1:1.
//
// Data disimpan di tb_surat (jenis='kuitansi', sudah ada di ENUM) + JSON
// `data`. Tidak ada kolom, tabel, atau migration baru.
// ============================================
import { validateImageFile } from './quotation';
import { formatCurrency } from './helpers';

export { validateImageFile };
export { formatCurrency };

// --------------------------------------------------------------- ukuran fisik
export const KW_WIDTH_CM = 23;
export const KW_HEIGHT_CM = 9;

// PX_PER_MM dipakai hanya untuk mengonversi cm -> satuan CSS px saat preview
// di layar (1 cm = 96/2.54 px). PDF tetap 100% berbasis cm lewat @page.
const PX_PER_CM = 96 / 2.54;

/** Konversi cm -> px string untuk preview layar. PDF memakai nilai cm asli. */
export const cmToPx = (cm) => `${(Number(cm) || 0) * PX_PER_CM}px`;

// ------------------------------------------------------------------- navbar
export const KW_SUBJECT = 'Kwitansi';

// ------------------------------------------------------------------!
// TERBILANG                                                            |
// ------------------------------------------------------------------!

const ANGKA = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
];

const SCALE = ['', 'ribu', 'juta', 'miliar', 'triliun'];

/**
 * Terbilang untuk 0..999.
 * Mengikuti ejaan resmi: 10 sepuluh, 11 sebelas, 12 dua belas,
 * 20 dua puluh, 21 dua puluh satu, 100 seratus, 101 seratus satu.
 */
function kataTigaDigit(n) {
  const satuan = ANGKA[n % 10];
  const cap = Math.floor(n / 10) % 10;
  const ratus = Math.floor(n / 100);

  let out = '';
  if (ratus) out += ratus === 1 ? 'seratus' : `${ANGKA[ratus]} ratus`;

  if (cap === 1) {
    // 10 sepuluh, 11 sebelas, 12-19 "<digit> belas".
    // Catatan: satuan di atas sudah berupa KATA ('' untuk 0), jadi untuk
    // memeriksa 0/1 harus pakai angka digitnya, bukan string kata.
    const digit = n % 10;
    const tigaDigit = digit === 0 ? 'sepuluh' : digit === 1 ? 'sebelas' : `${satuan} belas`;
    out += out ? ` ${tigaDigit}` : tigaDigit;
  } else if (cap > 1) {
    out += out ? ` ${ANGKA[cap]} puluh` : `${ANGKA[cap]} puluh`;
    if (satuan) out += ` ${satuan}`;
  } else if (satuan) {
    out += out ? ` ${satuan}` : satuan;
  }
  return out;
}

/** Huruf pertama jadi kapital: "Dua puluh tiga juta ...". */
function kapitalisasi(teks) {
  return teks ? teks.charAt(0).toUpperCase() + teks.slice(1) : teks;
}

/**
 * Angka -> kata Bahasa Indonesia (tanpa kata "rupiah").
 * 1000 -> "Seribu", 2300000 -> "Dua juta tiga ratus ribu",
 * 23530000 -> "Dua puluh tiga juta lima ratus tiga puluh ribu".
 */
export function toTerbilang(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (!Number.isFinite(n) || n === 0) return 'Nol';

  const parts = [];
  let group = 0;
  while (n > 0) {
    const tigaDigit = n % 1000;
    if (tigaDigit > 0) {
      // 1.000 -> "seribu" (bukan "satu ribu"). Untuk "juta"/"miliar" tetap
      // "satu juta" / "satu miliar" mengikuti ejaan resmi.
      const useSe = tigaDigit === 1 && SCALE[group] === 'ribu';
      const word = useSe ? 'seribu' : kataTigaDigit(tigaDigit);
      parts.unshift(useSe ? word : `${word} ${SCALE[group]}`.trim());
    }
    n = Math.floor(n / 1000);
    group += 1;
  }
  return kapitalisasi(parts.join(' '));
}

/** Terbilang lengkap untuk kwitansi, selalu diakhiri "rupiah". */
export function formatTerbilang(value) {
  return `${toTerbilang(value)} rupiah`;
}

/** "Rp 23.530.000" - untuk preview & kolom JUMLAH di list. */
export function formatRupiah(value) {
  const n = Number(value);
  return formatCurrency(Number.isFinite(n) ? n : 0);
}

/** "23.530.000" (tanpa Rp) - untuk kotak "Jumlah Rp." di cetakan. */
export function formatNominalAngka(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n);
}

// ------------------------------------------------------------------- tanggal
/** "07 Oktober 2026" - zero padded, mengikuti cetakan kwitansi. */
export function formatTanggalKwitansi(dateStr) {
  if (!dateStr) return '-';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d;
  if (m) {
    d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  } else {
    d = new Date(dateStr);
  }
  if (Number.isNaN(d.getTime())) return '-';
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------- form
export function createInitialReceiptForm(values = {}) {
  const d = new Date();
  return {
    nomor: '',
    tanggal: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`,
    city: 'Surabaya',
    // Sumber kwitansi (invoice).
    sumberId: null,
    sumberJenis: '',
    // Kolom generic dipakai list/present() supaya tidak kosong.
    subject: KW_SUBJECT,
    // Isi kwitansi.
    customerName: '',
    nomorInvoice: '',
    tanggalInvoice: '',
    nominal: '',
    untukPembayaran: '',
    // Penandatangan.
    companyName: 'CV. Elmech Technology Indonesia',
    signerName: 'Muhammad Taufiq Rahman',
    signerTitle: 'Direktur',
    useSignature: false,
    signatureImage: null,
    signatureX: 0,
    signatureY: 0,
    signatureZoom: 100,
    useStamp: false,
    stampImage: null,
    stampX: 0,
    stampY: 0,
    stampZoom: 100,
    ...values,
  };
}

/**
 * Ambil field kwitansi dari invoice yang dipilih.
 * `isiBilaKosong` dipakai supaya data yang sudah diketik user tidak tertimpa.
 */
export function terisiBilaKosong(sekarang, dariSumber) {
  const s = String(sekarang ?? '').trim();
  if (s !== '' && s !== '-') return s;
  return String(dariSumber ?? '').trim() || s;
}

/** Payload untuk endpoint surat generik (jenis = kuitansi). */
export function buildReceiptPayload(form, assetIds = {}) {
  const position = (x, y, zoomPercent) => ({
    x: Number(x) || 0,
    y: Number(y) || 0,
    zoom: (Number(zoomPercent) || 100) / 100,
  });

  return {
    nomor: form.nomor || '',
    tanggal: form.tanggal || '',
    city: form.city || 'Surabaya',
    subject: form.subject || KW_SUBJECT,
    // customerName = penerima, dipakai list/present().
    customerName: form.customerName || '',
    customerAddress: '',
    sumberId: form.sumberId || null,
    sumberJenis: form.sumberJenis || '',
    nomorInvoice: form.nomorInvoice || '',
    tanggalInvoice: form.tanggalInvoice || '',
    nominal: Number(form.nominal) || 0,
    untukPembayaran: form.untukPembayaran || '',
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
    notes: [],
    // Kwitansi tidak punya daftar item; nominal disimpan di `total`.
    items: [],
  };
}

/** Mapping detail API -> state edit. */
export function formFromReceiptDetail(detail) {
  const s = detail || {};
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

  return {
    assetIds: {
      signature: s.id_asset_ttd ?? null,
      stamp: s.id_asset_stempel ?? null,
    },
    form: createInitialReceiptForm({
      nomor: s.nomor || '',
      tanggal: s.tanggal || '',
      city: d.city || 'Surabaya',
      customerName: d.customerName || '',
      sumberId: d.sumberId ?? null,
      sumberJenis: d.sumberJenis || '',
      nomorInvoice: d.nomorInvoice || '',
      tanggalInvoice: d.tanggalInvoice || '',
      // Fallback ke kolom `total` tb_surat bila JSON lama belum punya nominal.
      nominal: d.nominal ?? s.total ?? '',
      untukPembayaran: d.untukPembayaran || '',
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
      companyName: d.signature?.companyName || 'CV. Elmech Technology Indonesia',
      signerName: d.signature?.signerName || '',
      signerTitle: d.signature?.signerTitle || '',
    }),
  };
}

/** Validasi: hanya field yang memang dipakai cetakan kwitansi. */
export function validateReceipt(form) {
  const errors = {};
  if (!String(form.nomor || '').trim()) errors.nomor = 'Nomor kwitansi wajib diisi.';
  if (!String(form.tanggal || '').trim()) errors.tanggal = 'Tanggal kwitansi wajib diisi.';
  if (!String(form.customerName || '').trim()) {
    errors.customerName = 'Nama penerima wajib diisi.';
  }
  if (!(Number(form.nominal) > 0)) {
    errors.nominal = 'Nominal harus lebih dari 0.';
  }
  if (!String(form.untukPembayaran || '').trim()) {
    errors.untukPembayaran = 'Keterangan pembayaran wajib diisi.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// ------------------------------------------------------------------- PDF CSS
/**
 * CSS print khusus kwitansi. Di-append SETELAH seluruh CSS aplikasi
 * (lihat buildPreviewHtml), sehingga menimpa `@page { size: A4 }` dan
 * aturan `#letter-print-root` milik modul A4 tanpa mengubah modul lain.
 *
 * PENTING: tidak ada `zoom`/`transform` di sini supaya ukuran fisik PDF
 * benar-benar 230mm x 90mm.
 */
export const KW_PRINT_CSS = `
@page {
  size: 230mm 90mm;
  margin: 0;
}
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    width: 230mm !important;
    height: 90mm !important;
    overflow: hidden !important;
  }
  #letter-print-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 230mm !important;
    height: 90mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .kw-sheet {
    width: 230mm !important;
    height: 90mm !important;
    box-shadow: none !important;
    page-break-after: auto !important;
    break-after: auto !important;
  }
}
`;
