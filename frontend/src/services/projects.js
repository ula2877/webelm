// Service API Projek (tb_project) - menggantikan mock frontend.
// Bentuk response mengikuti pola services/surat.js: response.data langsung
// ({status, data, meta}), error 422 membawa err.errors per-field.
import api from './api';

export async function fetchProjects(
  { search = '', status = '', jenis = '', urgency = '', pelunasan = '', page = 1, perPage = 6 } = {}
) {
  const response = await api.get('/api/projects', {
    params: { search, status, jenis, urgency, pelunasan, page, per_page: perPage },
  });
  return response.data;
}

export async function fetchProjectDetail(id) {
  const response = await api.get(`/api/projects/${id}`);
  return response.data;
}

export async function fetchProjectDetailByUuid(uuid) {
  const response = await api.get(`/api/projects/uuid/${uuid}`);
  return response.data;
}

export async function saveProject(payload) {
  const response = await api.post('/api/projects', payload);
  return response.data;
}

export async function updateProject(id, payload) {
  const response = await api.put(`/api/projects/${id}`, payload);
  return response.data;
}

export async function updateProjectByUuid(uuid, payload) {
  const response = await api.put(`/api/projects/uuid/${uuid}`, payload);
  return response.data;
}

export async function deleteProject(id) {
  const response = await api.delete(`/api/projects/${id}`);
  return response.data;
}

// Upload gambar deskripsi (WYSIWYG). Backend menyimpan file dan
// mengembalikan absolute URL - DB tidak menyimpan base64.
export async function uploadDescriptionImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/api/projects/description-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

// Hapus gambar deskripsi yang sudah tidak dipakai lagi. Backend memvalidasi
// URL (host + folder aplikasi, anti traversal) dan menolak menghapus file
// yang masih direferensikan project lain. Aman dipanggil dengan URL lama
// (gambar eksternal/legacy akan di-skip, bukan dihapus).
export async function deleteDescriptionImages(urls) {
  const response = await api.post('/api/projects/description-image/delete', { urls });
  return response.data;
}

// File Manager - Project Files (tb_files via UUID)

// Get list of files for a project
export async function fetchProjectFiles(uuid) {
  const response = await api.get(`/api/projects/uuid/${uuid}/files`);
  return response.data;
}

// Upload a file for a project
export async function uploadProjectFile(uuid, file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/api/projects/uuid/${uuid}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

// Download/View a file for a project
export async function downloadProjectFile(uuid, fileId) {
  const response = await api.get(`/api/projects/uuid/${uuid}/files/${fileId}`, {
    responseType: 'blob',
  });
  return response;
}

// Delete a file for a project
export async function deleteProjectFile(uuid, fileId) {
  const response = await api.delete(`/api/projects/uuid/${uuid}/files/${fileId}`);
  return response.data;
}

// Project Progress (tb_progress via UUID). id_project di-resolve backend dari
// uuid_project; frontend tidak pernah mengirim id_project.
export async function fetchProjectProgress(uuid) {
  const response = await api.get(`/api/projects/uuid/${uuid}/progress`);
  return response.data;
}

// Simpan progress + lampiran dalam SATU request multipart/form-data.
// files: array File (opsional). onProgress(persen) dipakai untuk indikator
// upload; aman dipanggil tanpa files (percent tidak akan terpanggil).
export async function saveProjectProgress(
  uuid,
  { progress, deskripsi, files = [], onProgress } = {}
) {
  const formData = new FormData();
  formData.append('progress', progress);
  formData.append('deskripsi', deskripsi);
  files.forEach((file) => formData.append('files[]', file));

  const response = await api.post(`/api/projects/uuid/${uuid}/progress`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (typeof onProgress === 'function' && event.total) {
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });
  return response.data;
}

// Hapus SATU catatan progress beserta lampirannya. Backend memvalidasi bahwa
// progress milik projek (via uuid), menghapus record tb_progress + tb_files,
// lalu menghapus file fisik yang TIDAK lagi dipakai progress lain. Respons
// memuat deleted_files/kept_files/files_failed.
export async function deleteProjectProgress(uuid, progressId) {
  const response = await api.delete(
    `/api/projects/uuid/${uuid}/progress/${progressId}`
  );
  return response.data;
}

// Project Payment (tb_pembayaran via UUID). Backend menghitung ringkasan
// (harga/total/sisa) dari data aktual; frontend tidak pernah mengirim
// id_project maupun total.
export async function fetchProjectPayments(uuid) {
  const response = await api.get(`/api/projects/uuid/${uuid}/pembayaran`);
  return response.data;
}

// Tambah transaksi pembayaran + bukti transfer (opsional). bukti berupa File.
export async function saveProjectPayment(uuid, { pelunasan, nominal, bukti } = {}) {
  const formData = new FormData();
  formData.append('pelunasan', pelunasan);
  formData.append('nominal', nominal);
  if (bukti) formData.append('bukti', bukti);

  const response = await api.post(
    `/api/projects/uuid/${uuid}/pembayaran`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

// Hapus SATU transaksi pembayaran beserta file buktinya (bila file tersebut
// tidak dipakai data lain). Backend memvalidasi kepemilikan transaksi lewat
// uuid projek; respons memuat `data.summary` terbaru + status file.
export async function deleteProjectPayment(uuid, paymentId) {
  const response = await api.delete(
    `/api/projects/uuid/${uuid}/pembayaran/${paymentId}`
  );
  return response.data;
}
