// ============================================
// PROJEK - mock store frontend sementara.
//
// TAHAP FRONTEND: belum ada backend/API/database untuk projek, jadi data
// disimpan di module-level array + localStorage (bertahan saat navigasi
// SPA maupun refresh). Bentuk interface mengikuti kontrak yang diminta:
//
//   { id, code, name, customer, description, startDate, endDate, status }
//
// Saat backend siap, cukup ganti isi fungsi list/get/create/update/delete
// dengan panggilan API - halaman tidak perlu diubah.
// ============================================

export const PROJECT_STATUS = ['Draft', 'Aktif', 'Selesai', 'Ditunda', 'Dibatalkan'];

// Status -> varian Badge existing (components/ui/Badge).
export const PROJECT_STATUS_VARIANT = {
  Draft: 'default',
  Aktif: 'success',
  Selesai: 'info',
  Ditunda: 'warning',
  Dibatalkan: 'error',
};

const STORAGE_KEY = 'elmech-projects-v1';

const SEED = [
  {
    id: 1,
    code: 'PRJ/001/ELMECH/2026',
    name: 'Sistem Monitoring Pabrik',
    customer: 'PT Contoh Indonesia',
    description: 'Pengembangan sistem monitoring mesin pabrik berbasis IoT.',
    startDate: '2026-10-08',
    endDate: '2026-12-20',
    status: 'Aktif',
  },
  {
    id: 2,
    code: 'PRJ/002/ELMECH/2026',
    name: 'Aplikasi Tracking Kapal',
    customer: 'PSDKP Benoa',
    description: 'Sistem tracking posisi kapal dan monitoring BBM kapal pengawas.',
    startDate: '2026-06-12',
    endDate: '2026-09-30',
    status: 'Selesai',
  },
  {
    id: 3,
    code: 'PRJ/003/ELMECH/2026',
    name: 'Instalasi Flowmeter BBM',
    customer: 'PT Bahari Nusantara',
    description: 'Pengadaan dan instalasi fuel flowmeter 8mm beserta kontroler GSM.',
    startDate: '2026-08-01',
    endDate: '2026-11-15',
    status: 'Aktif',
  },
  {
    id: 4,
    code: 'PRJ/004/ELMECH/2026',
    name: 'Maintenance Sistem SCADA',
    customer: 'PT Pupuk Kalimantan Timur',
    description: 'Kontrak pemeliharaan rutin sistem SCADA plant 1.',
    startDate: '2026-01-05',
    endDate: '2026-12-31',
    status: 'Aktif',
  },
  {
    id: 5,
    code: 'PRJ/005/ELMECH/2026',
    name: 'Pengadaan Hourmeter Digital',
    customer: 'PT Pelabuhan Perikanan',
    description: 'Pengadaan hourmeter digital untuk armada kapal.',
    startDate: '2026-09-01',
    endDate: '2026-10-31',
    status: 'Ditunda',
  },
  {
    id: 6,
    code: 'PRJ/006/ELMECH/2026',
    name: 'Sistem Realtime Tracking Armada',
    customer: 'PT Logistik Samudra',
    description: 'GPS tracking realtime untuk 25 unit armada truk.',
    startDate: '2026-07-10',
    endDate: '2026-10-10',
    status: 'Selesai',
  },
  {
    id: 7,
    code: 'PRJ/007/ELMECH/2026',
    name: 'Integrasi Sensor Suhu Cold Storage',
    customer: 'PT Ikan Segar Abadi',
    description: 'Integrasi sensor suhu ruang pendingin dengan dashboard monitoring.',
    startDate: '2026-11-01',
    endDate: '2027-01-31',
    status: 'Draft',
  },
  {
    id: 8,
    code: 'PRJ/008/ELMECH/2026',
    name: 'Upgrade Power Supply 24VDC',
    customer: 'PT Dok Bahari',
    description: 'Upgrade power supply peralatan navigasi dermaga.',
    startDate: '2026-05-20',
    endDate: '2026-06-20',
    status: 'Dibatalkan',
  },
];

// Cache memory di atas localStorage: CRUD tetap konsisten dalam sesi ini
// bahkan bila localStorage tidak tersedia/korup; localStorage dipakai agar
// data bertahan saat refresh (ditulis setiap ada perubahan).
let memoryRows = null;

function loadStore() {
  if (memoryRows) return memoryRows.map((p) => ({ ...p }));
  let rows = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rows = parsed;
    }
  } catch {
    // localStorage tidak tersedia / korup -> pakai seed di memory.
  }
  memoryRows = (rows || SEED).map((p) => ({ ...p }));
  return memoryRows.map((p) => ({ ...p }));
}

function saveStore(rows) {
  memoryRows = rows.map((p) => ({ ...p }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryRows));
  } catch {
    // abaikan: state memory sesi ini tetap benar.
  }
}

function nextId(rows) {
  return rows.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
}

/** Seluruh projek (salinan agar state internal tidak bocor). */
export function listProjects() {
  return loadStore().map((p) => ({ ...p }));
}

/** Satu projek by id, atau null bila tidak ada. */
export function getProject(id) {
  const rows = loadStore();
  const found = rows.find((p) => String(p.id) === String(id));
  return found ? { ...found } : null;
}

/** Tambah projek, mengembalikan record baru. */
export function createProject(data) {
  const rows = loadStore();
  const record = {
    id: nextId(rows),
    code: String(data.code || '').trim(),
    name: String(data.name || '').trim(),
    customer: String(data.customer || '').trim(),
    description: String(data.description || '').trim(),
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    status: PROJECT_STATUS.includes(data.status) ? data.status : 'Draft',
  };
  rows.push(record);
  saveStore(rows);
  return { ...record };
}

/** Ubah projek, mengembalikan record baru atau null bila id tak ada. */
export function updateProject(id, data) {
  const rows = loadStore();
  const index = rows.findIndex((p) => String(p.id) === String(id));
  if (index === -1) return null;
  rows[index] = {
    ...rows[index],
    code: String(data.code || '').trim(),
    name: String(data.name || '').trim(),
    customer: String(data.customer || '').trim(),
    description: String(data.description || '').trim(),
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    status: PROJECT_STATUS.includes(data.status) ? data.status : rows[index].status,
  };
  saveStore(rows);
  return { ...rows[index] };
}

/** Hapus projek. Mengembalikan true bila ada yang dihapus. */
export function deleteProject(id) {
  const rows = loadStore();
  const kept = rows.filter((p) => String(p.id) !== String(id));
  if (kept.length === rows.length) return false;
  saveStore(kept);
  return true;
}

/** Validasi form create/edit. */
export function validateProject(form) {
  const errors = {};
  if (!String(form.code || '').trim()) errors.code = 'Kode projek wajib diisi.';
  if (!String(form.name || '').trim()) errors.name = 'Nama projek wajib diisi.';
  if (!String(form.customer || '').trim()) errors.customer = 'Customer / instansi wajib diisi.';
  if (!String(form.startDate || '').trim()) errors.startDate = 'Tanggal mulai wajib diisi.';
  if (!String(form.endDate || '').trim()) errors.endDate = 'Tanggal selesai wajib diisi.';
  if (
    form.startDate &&
    form.endDate &&
    String(form.endDate) < String(form.startDate)
  ) {
    errors.endDate = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  }
  if (!PROJECT_STATUS.includes(form.status)) errors.status = 'Status wajib dipilih.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function emptyProjectForm() {
  return {
    code: '',
    name: '',
    customer: '',
    description: '',
    startDate: '',
    endDate: '',
    status: '',
  };
}
