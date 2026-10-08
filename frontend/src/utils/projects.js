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
  { value: 'running', label: 'Berjalan' },
  { value: 'done', label: 'Selesai' },
  { value: 'cancel', label: 'Dibatalkan' },
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

const STATUS_VALUES = PROJECT_STATUS.map((s) => s.value);
const JENIS_VALUES = PROJECT_JENIS.map((s) => s.value);
const URGENCY_VALUES = PROJECT_URGENCY.map((s) => s.value);

export function projectStatusLabel(value) {
  return PROJECT_STATUS.find((s) => s.value === value)?.label || value || '-';
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
  };
}

/** Detail API -> state form edit. */
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
  };
}
