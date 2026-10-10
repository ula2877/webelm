// Service API Dashboard - agregasi statistik projek & pendapatan.
// Mengikuti pola services/projects.js: response {status, data, meta}.
import api from './api';

/**
 * Ambil statistik dashboard untuk periode (bulan/tahun) tertentu.
 * Backend menghitung: projek done/running, total pembayaran diterima,
 * nilai projek running, ringkasan pelunasan, dan tren bulanan.
 *
 * @param {{ month?: number, year?: number, range?: number }} params
 */
export async function fetchDashboard({ month, year, range = 6 } = {}) {
  const response = await api.get('/api/dashboard', {
    params: { month, year, range },
  });
  return response.data;
}
