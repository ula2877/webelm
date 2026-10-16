// ============================================
// SPK (Surat Perintah Kerja) - util pembentukan dokumen
// ============================================
//
// Membantu Projek.jsx menyusun satu-satunya blok data yang dibutuhkan untuk
// SPK, sebelum SpkPreview meng-serialize blok tersebut menjadi HTML:
//
//   - penanggung jawab (worker pertama yang ditugaskan),
//   - baris tabel informasi projek (3 kolom: keterangan | : | nilai),
//   - form spk yang diteruskan ke komponen preview.
//
// Tidak ada logika PDF di sini - rendering & pembuatan PDF memakai mekanisme
// yang sudah ada (buildPreviewHtml + Chrome headless), persis seperti surat
// lain.

// Judul dokumen SPK (diteruskan ke SpkPreview untuk ditampilkan rata tengah).
export const SPK_TITLE = 'SURAT PERINTAH KERJA (SPK)';

/**
 * Ambil nama penanggung jawab.
 *
 * Struktur existing tb_tim (id, id_project, id_worker) TIDAK punya konsep
 * khusus "penanggung jawab" (tidak ada kolom is_leader / urutan). Aturan yang
 * sudah berlaku = daftar worker yang ditugaskan, diurutkan mengikuti baris
 * tb_tim (urut PK). Untuk project dengan satu worker, nama itu adalah
 * penanggung jawab; bila lebih banyak worker, worker pertama (yang
 * ditugaskan pertama) dipilih secara deterministik - TIDAK secara acak.
 *
 * Mengembalikan null bila tidak ada worker.
 */
export function pickPenanggungJawab(workers) {
  const list = Array.isArray(workers) ? workers : [];
  const first = list.find((worker) => worker && worker.id !== undefined && worker.id !== null);
  return first?.nama ? String(first.nama) : null;
}

/**
 * Susun baris tabel informasi projek.
 *
 * Format: [label, ':', nilai] - kolom kedua berisi titik dua, persis seperti
 * tampilan referensi SPK (kolom 1 = keterangan, kolom 3 = nilai).
 *
 * Nilai kosong atau belum diisi tampil '-' tanpa error.
 */
export function buildSpkInfoRows(project) {
  const penanggung = pickPenanggungJawab(project.workers);
  const ownerName = project.client?.nama ? String(project.client.nama) : null;

  return [
    { label: 'Penanggung Jawab', colon: ':', value: penanggung ?? '-' },
    { label: 'Tanggal Mulai', colon: ':', value: formatTanggal(project.tanggal_mulai) },
    { label: 'Tanggal Selesai', colon: ':', value: formatTanggal(project.tanggal_selesai) },
    { label: 'Nama Proyek', colon: ':', value: project.judul || '-' },
    { label: 'Owner', colon: ':', value: ownerName ?? '-' },
  ];
}

/**
 * Bangun form yang diteruskan ke SpkPreview.
 *
 * `project` adalah satu-satunya objek yang dibaca dari GET
 * /api/projects/uuid/{uuid} (ada di bawah ini field `description` sebagai
 * HTML mentah - WYSIWYG - dan `client`/`workers` sebagai daftar).
 */
export function buildSpkForm(project, { signatureImage = null, stampImage = null } = {}) {
  return {
    title: project.judul || '-',
    penanggungJawab: pickPenanggungJawab(project.workers),
    tanggalMulai: project.tanggal_mulai ?? null,
    tanggalSelesai: project.tanggal_selesai ?? null,
    owner: project.client?.nama ?? null,
    descriptionHtml: project.description ?? '',
    signatureImage,
    stampImage,
  };
}

/** Render nilai tanggal; nilai yang kosong (null/'0000-00-00'/'') menjadi '-'. */
function formatTanggal(value) {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (raw === '' || raw === '0000-00-00') {
    return '-';
  }
  return raw;
}
