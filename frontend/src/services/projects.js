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

export async function saveProject(payload) {
  const response = await api.post('/api/projects', payload);
  return response.data;
}

export async function updateProject(id, payload) {
  const response = await api.put(`/api/projects/${id}`, payload);
  return response.data;
}

export async function deleteProject(id) {
  const response = await api.delete(`/api/projects/${id}`);
  return response.data;
}
