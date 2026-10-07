// ============================================
// BERITA ACARA SERAH TERIMA (BAST)
// helpers khusus BAST. Struktur dokumen,
// urutan, dan label mengikuti referensi
// "format berita acara serah terima.docx":
//
//   BERITA ACARA SERAH TERIMA
//   Nomor: BAST/03091/ELMECH/2026
//   Pada hari ini, <hari>, tanggal <tanggal>,
//   telah dilaksanakan Serah Terima Pekerjaan
//   berdasarkan:
//   Nomor SPK/PO : ... Tanggal ...,
//   Tanggal Pelaksanaan/ Serah Terima : ..., antara:
//   PIHAK PERTAMA -> PIHAK KEDUA
//   paragraf serah terima -> tabel -> penutup
//   -> tanda tangan kedua pihak
// ============================================

// Nama hari dalam bahasa Indonesia untuk paragraf pembuka.
const HARI_ID = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

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

/** Parse "YYYY-MM-DD" tanpa efek timezone (menjaga hari tetap utuh). */
function parseDateLocal(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Kamis" — nama hari Indonesia. */
export function formatHariID(dateStr) {
  const d = parseDateLocal(dateStr);
  return d ? HARI_ID[d.getDay()] : '-';
}

/** "03 September 2026" — tanggal panjang Indonesia (zero padding). */
export function formatTanggalPanjangID(dateStr) {
  const d = parseDateLocal(dateStr);
  if (!d) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Paragraf pembuka:
 * "Pada hari ini, Kamis, tanggal 03 September 2026,
 *  telah dilaksanakan Serah Terima Pekerjaan berdasarkan:"
 */
export function buildBastPembuka(tanggal) {
  const hari = formatHariID(tanggal);
  const tgl = formatTanggalPanjangID(tanggal);
  return `Pada hari ini, ${hari}, tanggal ${tgl}, telah dilaksanakan Serah Terima Pekerjaan berdasarkan:`;
}

/**
 * Paragraf sumber pekerjaan (pembuka lanjutan). Nomor SPK/PO bersifat
 * opsional, jadi klausanya dibuat/diubah agar kalimat tetap rapi:
 *   - ada nomor + tanggal -> "Nomor SPK/PO : X Tanggal Y, ..."
 *   - nomor saja          -> "Nomor SPK/PO : X, ..."
 *   - tanggal saja        -> "Tanggal SPK/PO : Y, ..."
 *   - kosong semua        -> klausa SPK/PO dilewati seluruhnya.
 */
export function buildBastSumber(nomorSPK, tanggalSPK, tanggalPelaksanaan) {
  const nomor = String(nomorSPK || '').trim();
  const adaTanggalSPK = String(tanggalSPK || '').trim() !== '';
  const tglSPK = adaTanggalSPK ? formatTanggalPanjangID(tanggalSPK) : '';
  const tglPelaksanaan = formatTanggalPanjangID(tanggalPelaksanaan);

  const parts = [];
  if (nomor && adaTanggalSPK) {
    parts.push(`Nomor SPK/PO : ${nomor} Tanggal ${tglSPK}`);
  } else if (nomor) {
    parts.push(`Nomor SPK/PO : ${nomor}`);
  } else if (adaTanggalSPK) {
    parts.push(`Tanggal SPK/PO : ${tglSPK}`);
  }
  parts.push(`Tanggal Pelaksanaan/ Serah Terima : ${tglPelaksanaan}`);

  return `${parts.join(', ')}, antara:`;
}

/**
 * Klausa SPK untuk paragraf serah terima. Nomor SPK/PO opsional, jadi
 * klausanya dibangkitkan agar tidak pernah menampilkan
 * "null"/"undefined"/"-" mentah dan kalimat tetap grammatik:
 *   - nomor + tanggal -> "berdasarkan SPK : X Tanggal Y."
 *   - nomor saja      -> "berdasarkan SPK : X."
 *   - tanggal saja    -> "berdasarkan SPK bertanggal Y."
 *   - kosong semua    -> "" (klausanya dilewati).
 */
function buildSpkClause(nomorSPK, tanggalSPK) {
  const nomor = String(nomorSPK || '').trim();
  const adaTanggalSPK = String(tanggalSPK || '').trim() !== '';
  const tglSPK = adaTanggalSPK ? formatTanggalPanjangID(tanggalSPK) : '';

  if (nomor && adaTanggalSPK) return `berdasarkan SPK : ${nomor} Tanggal ${tglSPK}.`;
  if (nomor) return `berdasarkan SPK : ${nomor}.`;
  if (adaTanggalSPK) return `berdasarkan SPK bertanggal ${tglSPK}.`;
  return '';
}

/** Blok identitas satu pihak (PIHAK PERTAMA / PIHAK KEDUA). */
export function buildBastPihak(label, namaPerusahaan, alamat) {
  return {
    heading: label,
    namaPerusahaan: namaPerusahaan || '-',
    alamat: alamat || '-',
    penutup: `Selanjutnya disebut ${label}.`,
  };
}

/**
 * Paragraf serah terima:
 * "Dengan ini kedua belah pihak menerangkan bahwa PIHAK KEDUA telah
 *  menyerahkan hasil pekerjaan kepada PIHAK PERTAMA, dan PIHAK PERTAMA
 *  telah menerima hasil pekerjaan tersebut dalam kondisi baik dan sesuai
 *  dengan pekerjaan yang dipesan berdasarkan SPK : {nomor} Tanggal {tanggal}."
 */
export function buildBastSerahTerima(nomorSPK, tanggalSPK) {
  const clause = buildSpkClause(nomorSPK, tanggalSPK);
  return (
    'Dengan ini kedua belah pihak menerangkan bahwa PIHAK KEDUA telah menyerahkan ' +
    'hasil pekerjaan kepada PIHAK PERTAMA, dan PIHAK PERTAMA telah menerima hasil ' +
    'pekerjaan tersebut dalam kondisi baik dan sesuai dengan pekerjaan yang dipesan ' +
    clause
  ).trimEnd() + (clause ? '' : '.');
}

/** Paragraf penutup (mengikuti referensi, tanpa trailing period tambahan). */
export const BAST_PENUTUP =
  'Demikian Berita Acara Serah Terima Pekerjaan ini dibuat dengan ' +
  'sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.';

/** Form awal BAST. values={{}} dipakai mode edit. */
export function createInitialBastForm(values = {}) {
  const d = new Date();
  return {
    nomor: '',
    tanggal: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`,
    // Sumber dokumen (opsional, diisi dari Surat Jalan).
    sumberSuratJalanId: null,
    nomorSuratJalan: '',
    nomorPenawaran: '',
    // Informasi berita acara.
    nomorSPK: '',
    tanggalSPK: '',
    tanggalPelaksanaan: '',
    // Pihak pertama (penerima pekerjaan).
    pihakPertamaNama: '',
    pihakPertamaAlamat: '',
    // Pihak kedua (penyerah pekerjaan / ELMECH).
    pihakKeduaNama: 'CV Elmech Technology Indonesia',
    pihakKeduaAlamat: 'Prum. Putra Bangsa III Blok G No.2A, Medokan Ayu, Surabaya',
    // Pekerjaan & komponen.
    items: [],
    // Penandatanganan.
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
    signerName: 'Muhammad Taufiq Rahman',
    signerTitle: 'Direktur',
    ...values,
  };
}

/** Payload untuk endpoint surat generik (jenis = bast). */
export function buildBastPayload(form, assetIds = {}) {
  const position = (x, y, zoomPercent) => ({
    x: Number(x) || 0,
    y: Number(y) || 0,
    zoom: (Number(zoomPercent) || 100) / 100,
  });

  // BAST tidak memakai harga -> kirim 0, biarkan backend computing nol.
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
    // Kolom generic tetap diisi agar list/present() tidak kosong.
    city: '',
    subject: '',
    customerName: form.pihakPertamaNama || '',
    customerAddress: form.pihakPertamaAlamat || '',
    receiverName: '',
    notes: [],
    // Field khusus BAST (disimpan di JSON `data` tb_surat).
    sumberSuratJalanId: form.sumberSuratJalanId || null,
    nomorSuratJalan: form.nomorSuratJalan || '',
    nomorPenawaran: form.nomorPenawaran || '',
    nomorSPK: form.nomorSPK || '',
    tanggalSPK: form.tanggalSPK || '',
    tanggalPelaksanaan: form.tanggalPelaksanaan || '',
    pihakPertamaNama: form.pihakPertamaNama || '',
    pihakPertamaAlamat: form.pihakPertamaAlamat || '',
    pihakKeduaNama: form.pihakKeduaNama || '',
    pihakKeduaAlamat: form.pihakKeduaAlamat || '',
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
      companyName: form.pihakKeduaNama || '',
      signerName: form.signerName || '',
      signerTitle: form.signerTitle || '',
    },
    items,
  };
}

/** Validasi BAST. Tidak terlalu ketat: hanya field yang memang wajib. */
export function validateBast(form) {
  const errors = {};
  if (!String(form.nomor || '').trim()) errors.nomor = 'Nomor berita acara wajib diisi.';
  if (!String(form.tanggal || '').trim()) {
    errors.tanggal = 'Tanggal berita acara wajib diisi.';
  }
  if (!String(form.pihakPertamaNama || '').trim()) {
    errors.pihakPertamaNama = 'Nama perusahaan pihak pertama wajib diisi.';
  }
  if (!String(form.pihakKeduaNama || '').trim()) {
    errors.pihakKeduaNama = 'Nama perusahaan pihak kedua wajib diisi.';
  }

  const items = form.items || [];
  if (items.length === 0) {
    errors.items = 'Minimal satu pekerjaan/komponen harus ditambahkan.';
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
