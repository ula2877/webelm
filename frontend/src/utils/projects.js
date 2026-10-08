// ============================================
// PROJEK - helper form & mapping frontend <-> API.
//
// Data lewat services/projects.js (tb_project). Nilai enum mengikuti
// database apa adanya; label Indonesia hanya untuk tampilan:
//   status: running/done/cancel -> Berjalan/Selesai/Dibatalkan
//   jenis: pcb/project          -> PCB/Project
//   urgency: urgent/normal/non-urgent
//
// Kode projek <-> uuid_project, nama <-> judul, customer <-> id_client
// (nama client dibaca dari tb_user), tanggal <-> kolom tanggal_*.
// ============================================

export const PROJECT_STATUS = [
  { value: 'running', label: 'Running' },
  { value: 'done', label: 'Done' },
  { value: 'cancel', label: 'Cancelled' },
];

// Status -> varian Badge existing (components/ui/Badge).
export const PROJECT_STATUS_VARIANT = {
  running: 'info',
  done: 'success',
  cancel: 'error',
};

export const PROJECT_JENIS = [
  { value: 'pcb', label: 'PCB' },
  { value: 'project', label: 'Project' },
];

export const PROJECT_URGENCY = [
  { value: 'urgent', label: 'Mendesak' },
  { value: 'normal', label: 'Normal' },
  { value: 'non-urgent', label: 'Tidak Mendesak' },
];

export const PROJECT_URGENCY_VARIANT = {
  urgent: 'error',
  normal: 'default',
  'non-urgent': 'info',
};

// Pelunasan dihitung backend dari tb_pembayaran (lunas > dp > belum_bayar).
// Bukan kolom tb_project - hanya untuk tampilan.
export const PROJECT_PELUNASAN = [
  { value: 'belum_bayar', label: 'Belum Bayar' },
  { value: 'dp', label: 'DP' },
  { value: 'lunas', label: 'Lunas' },
];

export const PROJECT_PELUNASAN_VARIANT = {
  belum_bayar: 'default',
  dp: 'warning',
  lunas: 'success',
};

const STATUS_VALUES = PROJECT_STATUS.map((s) => s.value);
const JENIS_VALUES = PROJECT_JENIS.map((s) => s.value);
const URGENCY_VALUES = PROJECT_URGENCY.map((s) => s.value);

export function projectStatusLabel(value) {
  return PROJECT_STATUS.find((s) => s.value === value)?.label || value || '-';
}

export function projectPelunasanLabel(value) {
  return PROJECT_PELUNASAN.find((s) => s.value === value)?.label || value || '-';
}

export function projectUrgencyLabel(value) {
  return PROJECT_URGENCY.find((s) => s.value === value)?.label || value || '-';
}

/** Validasi form create/edit (mirror aturan backend, pesan Indonesia). */
export function validateProject(form) {
  const errors = {};
  if (!String(form.code || '').trim()) {
    errors.code = 'Kode projek wajib diisi.';
  } else if (String(form.code).trim().length > 30) {
    errors.code = 'Kode projek maksimal 30 karakter.';
  }
  if (!String(form.name || '').trim()) errors.name = 'Nama projek wajib diisi.';
  if (!form.id_client) errors.id_client = 'Client wajib dipilih.';
  if (!String(form.startDate || '').trim()) errors.startDate = 'Tanggal mulai wajib diisi.';
  if (!String(form.estimasiDate || '').trim()) {
    errors.estimasiDate = 'Tanggal estimasi wajib diisi.';
  }
  if (!String(form.endDate || '').trim()) {
    errors.endDate = 'Tanggal selesai wajib diisi.';
  } else if (form.startDate && String(form.endDate) < String(form.startDate)) {
    errors.endDate = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  }
  if (!JENIS_VALUES.includes(form.jenis)) errors.jenis = 'Jenis projek wajib dipilih.';
  if (!STATUS_VALUES.includes(form.status)) errors.status = 'Status wajib dipilih.';
  if (!URGENCY_VALUES.includes(form.urgency)) errors.urgency = 'Urgency wajib dipilih.';
  if (form.harga !== '' && form.harga !== null && !(Number(form.harga) >= 0)) {
    errors.harga = 'Harga tidak boleh negatif.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function emptyProjectForm() {
  return {
    code: '',
    name: '',
    id_client: '',
    description: '',
    startDate: '',
    estimasiDate: '',
    endDate: '',
    jenis: '',
    status: '',
    urgency: 'normal',
    harga: '',
    is_proposed: false,
    // Daftar id tb_user worker (disimpan ke tb_tim, bukan tb_project).
    worker_ids: [],
  };
}

/** Detail API -> state form edit (termasuk worker existing dari tb_tim). */
export function formFromProjectDetail(detail) {
  const d = detail || {};
  return {
    code: d.code || d.uuid || '',
    name: d.name || d.judul || '',
    id_client: d.id_client || '',
    description: d.description ?? d.deskripsi ?? '',
    startDate: d.startDate || d.tanggal_mulai || '',
    estimasiDate: d.estimasiDate || d.tanggal_estimasi || '',
    endDate: d.endDate || d.tanggal_selesai || '',
    jenis: d.jenis || '',
    status: d.status || '',
    urgency: d.urgency || 'normal',
    harga: d.harga ?? '',
    is_proposed: !!d.is_proposed,
    worker_ids: Array.isArray(d.workers)
      ? d.workers.map((w) => Number(w.id)).filter((n) => Number.isFinite(n))
      : [],
  };
}

/** State form -> payload API (kunci kolom tb_project). */
export function buildProjectPayload(form) {
  return {
    uuid_project: String(form.code || '').trim() || null,
    id_client: Number(form.id_client) || null,
    judul: String(form.name || '').trim(),
    jenis: form.jenis || null,
    deskripsi: String(form.description || ''),
    tanggal_mulai: form.startDate || null,
    tanggal_estimasi: form.estimasiDate || null,
    tanggal_selesai: form.endDate || null,
    status: form.status || null,
    urgency: form.urgency || 'normal',
    harga: form.harga === '' || form.harga === null ? 0 : Number(form.harga),
    is_proposed: !!form.is_proposed,
    worker_ids: Array.isArray(form.worker_ids)
      ? form.worker_ids.map((id) => Number(id)).filter((n) => Number.isFinite(n))
      : [],
  };
}
