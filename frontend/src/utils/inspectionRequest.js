// ============================================
// SURAT PERMOHONAN PEMERIKSAAN HASIL PEKERJAAN
// helpers khusus modul ini. Struktur dokumen,
// urutan, dan label mengikuti referensi
// "format Surat Permohonan Pemeriksaan Hasil Pekerjaan.docx":
//
//   judul -> Nomor -> Lampiran/Perihal -> Tujuan ->
//   "Dengan hormat," -> dasar pekerjaan -> daftar (1. SPK, 2. Pekerjaan) ->
//   paragraf permohonan -> TABEL pekerjaan ->
//   paragraf pemeriksaan -> penutup -> tanda tangan (kanan).
// ============================================
import { emptyItem } from './suratJenis';

const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** Parse "YYYY-MM-DD" tanpa efek timezone (hari tetap utuh). */
function parseDateLocal(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Number(m[1]), month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "1 September 2026" — TANPA zero padding, mengikuti tanda tangan pada
 * dokumen referensi ("Surabaya, 1 September 2026").
 */
export function formatTanggalID(dateStr) {
  const d = parseDateLocal(dateStr);
  return d ? `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}` : '-';
}

/** "1 (satu) berkas" — nilai Lampiran. Kosong -> "-". */
export function formatLampiran(nilai) {
  const kata = {
    1: 'satu', 2: 'dua', 3: 'tiga', 4: 'empat', 5: 'lima',
    6: 'enam', 7: 'tujuh', 8: 'delapan', 9: 'sembilan', 10: 'sepuluh',
  };
  const n = String(nilai ?? '').trim();
  if (!n) return '-';
  return /^\d+$/.test(n) ? `${n} (${kata[n] || n}) berkas` : `${n} berkas`;
}

/** Baris tujuan: jabatan / instansi / alamat (dokumen referensi). */
export function buildPpTujuan(tujuanJabatan, tujuanInstansi, tujuanAlamat) {
  return [tujuanJabatan, tujuanInstansi, tujuanAlamat]
    .map((v) => String(v || '').trim())
    .filter((v) => v !== '');
}

/** Butir 1. Nomor SPK/PO opsional, klausanya menyesuaikan isi. */
export function buildPpButirSpk(nomorSPK, tanggalSPK) {
  const nomor = String(nomorSPK || '').trim();
  const adaTgl = String(tanggalSPK || '').trim() !== '';
  const tgl = adaTgl ? formatTanggalID(tanggalSPK) : '';

  if (nomor && adaTgl) return `SPK Nomor ${nomor} tanggal ${tgl};`;
  if (nomor) return `SPK Nomor ${nomor};`;
  if (adaTgl) return `SPK bertanggal ${tgl};`;
  return 'SPK;';
}

/** Butir 2: "Pekerjaan X;" */
export function buildPpButirPekerjaan(namaPekerjaan) {
  const nama = String(namaPekerjaan || '').trim();
  return nama ? `Pekerjaan ${nama};` : 'Pekerjaan;';
}

/** Paragraf permohonan (memohon kepada {tujuan}). */
export function buildPpPermohonan(perusahaan, tujuanInstansi) {
  const pt = String(perusahaan || '').trim() || 'CV Elmech Technology Indonesia';
  const tujuan = String(tujuanInstansi || '').trim();
  return tujuan
    ? `Dengan ini kami dari ${pt} memohon kepada ${tujuan} untuk dapat melaksanakan pemeriksaan terhadap hasil pekerjaan yang telah kami selesaikan dan serahkan.`
    : `Dengan ini kami dari ${pt} memohon kepada yang terhormat untuk dapat melaksanakan pemeriksaan terhadap hasil pekerjaan yang telah kami selesaikan dan serahkan.`;
}

/** Paragraf setelah tabel (mengikuti referensi). */
export const PP_PARAGRAF_PEMERIKSAAN =
  'Pemeriksaan tersebut kami mohon dapat dilaksanakan sebagai bagian dari proses ' +
  'administrasi penyelesaian pekerjaan sesuai dengan ketentuan yang berlaku.';

/** Paragraf penutup (mengikuti referensi). */
export const PP_PARAGRAF_PENUTUP =
  'Demikian surat permohonan ini kami sampaikan. Besar harapan kami agar permohonan ' +
  'pemeriksaan hasil pekerjaan tersebut dapat dilaksanakan. Atas perhatian dan kerja ' +
  'sama yang baik, kami sampaikan terima kasih.';

export const PP_DEFAULT_PERUSAHAAN = 'CV. Elmech Technology Indonesia';

/** Perihal tetap (mengikuti dokumen referensi). */
export const PP_DEFAULT_PERIHAL = 'Permohonan Pemeriksaan Hasil Pekerjaan';

/** Form awal modul ini. values={{}} dipakai mode edit. */
export function createInitialPpForm(values = {}) {
  const d = new Date();
  return {
    nomor: '',
    tanggal: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`,
    city: 'Surabaya',
    // Sumber dokumen (opsional).
    sumberId: null,
    sumberJenis: '',
    nomorSuratJalan: '',
    nomorPenawaran: '',
    // Informasi surat.
    lampiran: '1',
    perihal: PP_DEFAULT_PERIHAL,
    // Tujuan surat.
    tujuanJabatan: '',
    tujuanInstansi: '',
    tujuanAlamat: '',
    // Informasi pekerjaan.
    namaPekerjaan: '',
    nomorSPK: '',
    tanggalSPK: '',
    // Data pekerjaan.
    items: [emptyItem()],
    // Penandatanganan.
    companyName: PP_DEFAULT_PERUSAHAAN,
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
    stampY: 25,
    stampZoom: 100,
    ...values,
  };
}

/** Payload untuk endpoint surat generik (jenis = inspection-request). */
export function buildPpPayload(form, assetIds = {}) {
  const position = (x, y, zoomPercent) => ({
    x: Number(x) || 0,
    y: Number(y) || 0,
    zoom: (Number(zoomPercent) || 100) / 100,
  });

  const items = (form.items || []).map((item, index) => ({
    no_urut: index + 1,
    nama_komponen: item.nama_komponen || '',
    spesifikasi: String(item.spesifikasi || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
    volume: Number(item.volume) || 0,
    satuan: item.satuan || '',
    harga_satuan: 0,
    subtotal: 0,
  }));

  return {
    nomor: form.nomor || '',
    tanggal: form.tanggal || '',
    city: form.city || '',
    // Kolom generic: dipakai list/present() supaya tidak kosong.
    subject: form.perihal || PP_DEFAULT_PERIHAL,
    customerName: form.tujuanInstansi || '',
    customerAddress: form.tujuanAlamat || '',
    // Field khusus modul ini -> JSON `data` tb_surat.
    sumberId: form.sumberId || null,
    sumberJenis: form.sumberJenis || '',
    nomorSuratJalan: form.nomorSuratJalan || '',
    nomorPenawaran: form.nomorPenawaran || '',
    lampiran: form.lampiran || '',
    tujuanJabatan: form.tujuanJabatan || '',
    tujuanInstansi: form.tujuanInstansi || '',
    tujuanAlamat: form.tujuanAlamat || '',
    namaPekerjaan: form.namaPekerjaan || '',
    nomorSPK: form.nomorSPK || '',
    tanggalSPK: form.tanggalSPK || '',
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
    items,
  };
}

/**
 * Mapping detail API -> state edit. Field modul ini dari JSON `data`,
 * dengan fallback ke kolom generic untuk data lama.
 */
export function formFromPpDetail(detail) {
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

  const items =
    Array.isArray(s.items) && s.items.length
      ? s.items.map((it) => ({
          id: `item-${Math.random().toString(36).slice(2, 9)}`,
          nama_komponen: it.nama_komponen ?? '',
          spesifikasi: Array.isArray(it.spesifikasi) ? it.spesifikasi.join('\n') : '',
          volume: it.volume ?? '',
          satuan: it.satuan ?? '',
        }))
      : [emptyItem()];

  return {
    assetIds: { signature: s.id_asset_ttd ?? null, stamp: s.id_asset_stempel ?? null },
    form: createInitialPpForm({
      nomor: s.nomor || '',
      tanggal: s.tanggal || '',
      sumberId: d.sumberId ?? null,
      sumberJenis: d.sumberJenis || '',
      nomorSuratJalan: d.nomorSuratJalan || '',
      nomorPenawaran: d.nomorPenawaran || '',
      lampiran: d.lampiran || '1',
      perihal: d.perihal || d.subject || PP_DEFAULT_PERIHAL,
      tujuanJabatan: d.tujuanJabatan || '',
      tujuanInstansi: d.tujuanInstansi || d.customerName || '',
      tujuanAlamat: d.tujuanAlamat || d.customerAddress || '',
      namaPekerjaan: d.namaPekerjaan || '',
      nomorSPK: d.nomorSPK || '',
      tanggalSPK: d.tanggalSPK || '',
      items,
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
      companyName: d.signature?.companyName || PP_DEFAULT_PERUSAHAAN,
      signerName: d.signature?.signerName || '',
      signerTitle: d.signature?.signerTitle || '',
    }),
  };
}

/** Validasi. Hanya field yang memang dipakai dokumen. */
export function validatePp(form) {
  const errors = {};
  if (!String(form.nomor || '').trim()) errors.nomor = 'Nomor surat wajib diisi.';
  if (!String(form.tanggal || '').trim()) errors.tanggal = 'Tanggal surat wajib diisi.';
  if (!String(form.tujuanInstansi || '').trim()) {
    errors.tujuanInstansi = 'Nama instansi wajib diisi.';
  }
  if (!String(form.namaPekerjaan || '').trim()) {
    errors.namaPekerjaan = 'Nama pekerjaan wajib diisi.';
  }

  const items = form.items || [];
  if (items.length === 0) {
    errors.items = 'Minimal satu pekerjaan harus ditambahkan.';
  } else {
    const itemErrors = items.map((item) => {
      const e = {};
      if (!String(item.nama_komponen || '').trim()) {
        e.nama_komponen = 'Nama pekerjaan wajib diisi.';
      }
      return e;
    });
    if (itemErrors.some((e) => Object.keys(e).length > 0)) {
      errors.itemErrors = itemErrors;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
