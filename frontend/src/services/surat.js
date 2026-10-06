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

// Detail lengkap untuk mode edit (data JSON + items + posisi asset).
export async function fetchQuotationDetail(id) {
  const response = await api.get(`/api/surat/${id}/detail`);
  return response.data;
}

// Soft delete surat (set deleted_at) - mekanisme existing tb_surat.
export async function deleteSurat(id) {
  const response = await api.delete(`/api/surat/${id}`);
  return response.data;
}

// Update surat penawaran yang sudah ada.
export async function updateQuotation(id, payload) {
  const response = await api.put(`/api/surat/${id}/quotation`, payload);
  return response.data;
}

// Nomor surat penawaran berikutnya untuk tanggal tertentu (dihitung dari
// data aktif tb_surat jenis='quotation' di backend).
export async function fetchNextQuotationNumber(tanggal) {
  const response = await api.get('/api/surat/quotation/next-number', { params: { tanggal } });
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

// PDF dari HTML Live Preview (Chrome headless di backend) - hasil sama
// persis dengan yang terlihat di Live Preview.
export async function downloadQuotationPdfFromHtml(html) {
  const response = await api.post(
    '/api/surat/quotation/pdf-from-html',
    { html },
    { responseType: 'blob', timeout: 120000 }
  );
  return response.data;
}