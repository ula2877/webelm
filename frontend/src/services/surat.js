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

// Surat assets (signature / stamp) - backed by the existing tb_surat_asset table.
export async function fetchSuratAssets(jenis) {
  const response = await api.get('/api/surat-assets', { params: { jenis } });
  return response.data;
}

export async function uploadSuratAsset(jenis, file) {
  const formData = new FormData();
  formData.append('jenis', jenis);
  formData.append('file', file);
  const response = await api.post('/api/surat-assets', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

// Simpan Surat Penawaran ke tb_surat (+ tb_surat_item) via Laravel.
// Urutan backend: SAVE dulu, PDF baru dibuat setelah data tersimpan.
export async function saveQuotation(payload) {
  const response = await api.post('/api/surat/quotation', payload);
  return response.data;
}

// Unduh PDF surat penawaran yang sudah tersimpan (A4, desain = Live Preview).
// Mengembalikan Blob agar bisa di-download langsung ke browser.
export async function downloadQuotationPdf(id) {
  const response = await api.get(`/api/surat/${id}/pdf`, {
    responseType: 'blob',
  });
  return response.data;
}