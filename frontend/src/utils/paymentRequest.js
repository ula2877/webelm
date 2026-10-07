// ============================================
// SURAT PERMOHONAN PEMBAYARAN
// helpers khusus modul ini. Struktur dokumen, urutan, dan label
// mengikuti referensi "SURAT PERMOHONAN PEMBAYARAN.docx":
//
//   judul -> Nomor -> Lampiran/Perihal -> Yth. + "di Tempat" ->
//   "Dengan hormat," -> dasar (SPK + BAST) -> identitas perusahaan ->
//   "selaku Penyedia, ..." -> TABEL pekerjaan -> mohon pembayaran ->
//   dokumen pendukung (list) -> penutup -> tanggal -> tanda tangan.
// ============================================
import { emptyItem } from './suratJenis';

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
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
 * "03 September 2026" — DENGAN zero padding, mengikuti tanda tangan pada
 * dokumen referensi ("Surabaya, 03 September 2026").
 */
export function formatTanggalID(dateStr) {
  const d = parseDateLocal(dateStr);
  if (!d) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
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

/**
 * Paragraf pembuka ("Sehubungan dengan telah selesainya pekerjaan ...").
 * Nomor SPK & BAST opsional: klausa yang tidak ada datanya dilewati
 * agar kalimat tetap grammatik dan tidak pernah null/undefined.
 */
export function buildPpPembuka({ namaPekerjaan, nomorSPK, tanggalSPK, nomorBAST, tanggalBAST }) {
  const pekerjaan = String(namaPekerjaan || '').trim();
  let teks = pekerjaan
    ? `Sehubungan dengan telah selesainya pekerjaan ${pekerjaan} `
    : 'Sehubungan dengan telah selesainya pekerjaan';
  // Klausa "berdasarkan ..." menempel ke kalimat sebelumnya, jadi tetap
  // butuh satu spasi; kalau tidak ada klausa, spasi itu dibuang lagi.
  if (teks.endsWith('pekerjaan')) teks += ' ';

  const klausa = [];
  const spk = String(nomorSPK || '').trim();
  const tglSPK = String(tanggalSPK || '').trim() ? formatTanggalID(tanggalSPK) : '';
  if (spk && tglSPK) {
    klausa.push(`Surat Perintah Kerja (SPK) Nomor : ${spk} tanggal ${tglSPK}`);
  } else if (spk) {
    klausa.push(`Surat Perintah Kerja (SPK) Nomor : ${spk}`);
  } else if (tglSPK) {
    klausa.push(`Surat Perintah Kerja (SPK) bertanggal ${tglSPK}`);
  }

  const bast = String(nomorBAST || '').trim();
  const tglBAST = String(tanggalBAST || '').trim() ? formatTanggalID(tanggalBAST) : '';
  if (bast && tglBAST) {
    klausa.push(`Berita Acara Serah Terima Pekerjaan Nomor: ${bast} tanggal ${tglBAST}`);
  } else if (bast) {
    klausa.push(`Berita Acara Serah Terima Pekerjaan Nomor: ${bast}`);
  } else if (tglBAST) {
    klausa.push(`Berita Acara Serah Terima Pekerjaan bertanggal ${tglBAST}`);
  }

  if (klausa.length) {
    teks += `berdasarkan : ${klausa.join(' serta berdasarkan ')}`;
  }
  return `${teks}, dengan ini kami dari:`;
}

/** Identitas penyedia (dipakai sebagai 2 baris berlabel). */
export function buildPpIdentitas(perusahaanNama, perusahaanAlamat) {
  return [
    { label: 'Nama Perusahaan', nilai: String(perusahaanNama || '').trim() || '-' },
    { label: 'Alamat', nilai: String(perusahaanAlamat || '').trim() || '-' },
  ];
}

/** Baris tujuan: jabatan + instansi (dokumen referensi memakai "Yth."). */
export function buildPpTujuan(tujuanJabatan, tujuanInstansi) {
  return [tujuanJabatan, tujuanInstansi]
    .map((v) => String(v || '').trim())
    .filter((v) => v !== '');
}

/** Paragraf setelah tabel (mengikuti referensi). */
export const PPB_PARAGRAF_PEMBAYARAN =
  'Sehubungan dengan hal tersebut, kami memohon agar proses pembayaran pekerjaan dapat ' +
  'dilakukan sesuai dengan ketentuan yang berlaku dan nilai kontrak/SPK yang telah disepakati.';

/** Paragraf pengantar daftar dokumen pendukung. */
export const PPB_PARAGRAF_DOKUMEN =
  'Sebagai bahan kelengkapan administrasi pembayaran, bersama surat ini kami lampirkan ' +
  'dokumen pendukung yang diperlukan, antara lain:';

/** Paragraf penutup (mengikuti referensi, tanpa titik di akhir). */
export const PPB_PARAGRAF_PENUTUP =
  'Demikian surat permohonan pembayaran ini kami sampaikan. Besar harapan kami agar proses ' +
  'pembayaran dapat segera diproses sesuai dengan prosedur dan ketentuan yang berlaku. Atas ' +
  'perhatian dan kerja sama yang baik, kami ucapkan terima kasih';

export const PPB_DEFAULT_PERUSAHAAN = 'CV. Elmech Technology Indonesia';
export const PPB_DEFAULT_ALAMAT = 'Jl. Putra Bunga III Blok A No. 2A, Medokan Ayu, Surabaya';
export const PPB_DEFAULT_PERIHAL = 'Permohonan Pembayaran Pekerjaan';

/** Dokumen pendukung default, persis seperti dokumen referensi. */
export const PPB_DEFAULT_DOKUMEN = [
  'Surat Permohonan Pembayaran',
  'Invoice',
  'Berita Acara Serah Terima Pekerjaan',
  'Surat Perintah Kerja (SPK)',
  'Faktur Pajak',
  'Dokumen pendukung lainnya sesuai ketentuan',
];

/** Form awal modul ini. values={{}} dipakai mode edit. */
export function createInitialPpbForm(values = {}) {
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
    nomorPenawaran: '',
    // Informasi surat.
    lampiran: '1',
    perihal: PPB_DEFAULT_PERIHAL,
    // Tujuan surat.
    tujuanJabatan: '',
    tujuanInstansi: '',
    // Informasi pekerjaan.
    namaPekerjaan: '',
    nomorSPK: '',
    tanggalSPK: '',
    nomorBAST: '',
    tanggalBAST: '',
    // Identitas penyedia (diisi otomatis dari dokumen referensi).
    perusahaanNama: PPB_DEFAULT_PERUSAHAAN,
    perusahaanAlamat: PPB_DEFAULT_ALAMAT,
    // Data pekerjaan.
    items: [emptyItem()],
    // Dokumen pendukung.
    dokumenPendukung: [...PPB_DEFAULT_DOKUMEN],
    // Penandatanganan.
    companyName: 'CV. ELMECH TECHNOLOGY INDONESIA',
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

/** Payload untuk endpoint surat generik (jenis = payment-request). */
export function buildPpbPayload(form, assetIds = {}) {
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
    subject: form.perihal || PPB_DEFAULT_PERIHAL,
    customerName: form.tujuanInstansi || '',
    customerAddress: '',
    // Field khusus modul ini -> JSON `data` tb_surat.
    sumberId: form.sumberId || null,
    sumberJenis: form.sumberJenis || '',
    nomorPenawaran: form.nomorPenawaran || '',
    lampiran: form.lampiran || '',
    tujuanJabatan: form.tujuanJabatan || '',
    tujuanInstansi: form.tujuanInstansi || '',
    namaPekerjaan: form.namaPekerjaan || '',
    nomorSPK: form.nomorSPK || '',
    tanggalSPK: form.tanggalSPK || '',
    nomorBAST: form.nomorBAST || '',
    tanggalBAST: form.tanggalBAST || '',
    perusahaanNama: form.perusahaanNama || '',
    perusahaanAlamat: form.perusahaanAlamat || '',
    dokumenPendukung: (form.dokumenPendukung || []).map((d) => String(d).trim()).filter(Boolean),
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

/** Mapping detail API -> state edit. */
export function formFromPpbDetail(detail) {
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
    form: createInitialPpbForm({
      nomor: s.nomor || '',
      tanggal: s.tanggal || '',
      sumberId: d.sumberId ?? null,
      sumberJenis: d.sumberJenis || '',
      nomorPenawaran: d.nomorPenawaran || '',
      lampiran: d.lampiran || '1',
      perihal: d.perihal || d.subject || PPB_DEFAULT_PERIHAL,
      tujuanJabatan: d.tujuanJabatan || '',
      tujuanInstansi: d.tujuanInstansi || d.customerName || '',
      namaPekerjaan: d.namaPekerjaan || '',
      nomorSPK: d.nomorSPK || '',
      tanggalSPK: d.tanggalSPK || '',
      nomorBAST: d.nomorBAST || '',
      tanggalBAST: d.tanggalBAST || '',
      perusahaanNama: d.perusahaanNama || PPB_DEFAULT_PERUSAHAAN,
      perusahaanAlamat: d.perusahaanAlamat || PPB_DEFAULT_ALAMAT,
      items,
      dokumenPendukung:
        Array.isArray(d.dokumenPendukung) && d.dokumenPendukung.length
          ? d.dokumenPendukung
          : [...PPB_DEFAULT_DOKUMEN],
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
      companyName: d.signature?.companyName || 'CV. ELMECH TECHNOLOGY INDONESIA',
      signerName: d.signature?.signerName || '',
      signerTitle: d.signature?.signerTitle || '',
    }),
  };
}

/** Validasi: hanya field yang memang dipakai dokumen. */
export function validatePpb(form) {
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
