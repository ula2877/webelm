import api from './api';

// Surat - semua operasi baca pada tabel existing `tb_surat`.
// Tidak ada endpoint baru untuk data lain dan tidak ada kolom tambahan.

export async function fetchSurat({ search = '', jenis = '', status = '', page = 1, perPage = 6 } = {}) {
  const response = await api.get('/api/surat', {
    params: {
      search: search.trim(),
      jenis: jenis === 'all' ? '' : jenis,
      status: status === 'all' ? '' : status,
      page,
      per_page: perPage,
    },
  });

  return response.data;
}

export async function fetchSuratById(id) {
  const response = await api.get(`/api/surat/${id}`);
  return response.data;
}