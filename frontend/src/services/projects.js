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
