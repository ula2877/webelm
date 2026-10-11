import api from './api';

// User Management - semua operasi baca/tulis pada tabel existing `tb_user`.
// Tidak ada endpoint baru untuk data lain dan tidak ada kolom tambahan.

export async function fetchUserById(id) {
  const response = await api.get(`/api/users/${id}`);
  return response.data;
}

export async function fetchUsers({ search = '', level = '', page = 1, perPage = 8 } = {}) {
  const response = await api.get('/api/users', {
    params: {
      search: search.trim(),
      // Kirim `all` sebagai nilai kosong supaya filter tidak aktif, dan
      //enantikan query string tetap singkat.
      level: level === 'all' ? '' : level,
      page,
      per_page: perPage,
    },
  });

  return response.data;
}

// Opsi user RINGKAS untuk dropdown form (mis. form Projek memilih Client &
// Worker). Berbeda dengan fetchUsers (khusus admin), endpoint ini bisa dipakai
// semua user yang sudah login dan hanya mengembalikan kolom aman
// (id, username, nama, role) - tanpa no_hp/alamat.
export async function fetchUserOptions({ search = '', level = '', page = 1, perPage = 20 } = {}) {
  const response = await api.get('/api/user-options', {
    params: {
      search: search.trim(),
      level: level === 'all' ? '' : level,
      page,
      per_page: perPage,
    },
  });
  return response.data;
}

export async function createUser(payload) {
  const response = await api.post('/api/users', payload);
  return response.data;
}

export async function updateUser(id, payload) {
  const response = await api.put(`/api/users/${id}`, payload);
  return response.data;
}

export async function deleteUser(id) {
  const response = await api.delete(`/api/users/${id}`);
  return response.data;
}

// Dipakai oleh dialog konfirmasi hapus untuk memberi tahu berapa data
// terkait yang akan ikut terhapus (CASCADE) dan apakah hapus akan ditolak
// (RESTRICT / NO ACTION).
export async function fetchUserDependents(id) {
  const response = await api.get(`/api/users/${id}/dependents`);
  return response.data;
}

// Worker File endpoints
export async function fetchWorkerFiles(userId) {
  const response = await api.get(`/api/users/${userId}/worker-files`);
  return response.data;
}

export async function uploadWorkerFile(userId, { jenis, file }) {
  const formData = new FormData();
  formData.append('jenis', jenis);
  formData.append('file', file);

  const response = await api.post(`/api/users/${userId}/worker-files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteWorkerFileById(fileId, userId) {
  // `id_user` dikirim agar backend bisa memastikan file memang milik user
  // yang sedang diedit sebelum record + file fisiknya dihapus.
  const response = await api.delete(`/api/worker-files/${fileId}`, {
    params: userId ? { id_user: userId } : undefined,
  });
  return response.data;
}
