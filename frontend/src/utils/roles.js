// Sumber tunggal definisi role untuk frontend.
//
// `user` di sini adalah objek dari /api/me (AuthContext), yaitu data yang
// sudah diverifikasi backend - bukan nilai yang diisi bebas oleh pengguna.
// Identitas role memakai id_level (tb_level.id_level):
//   1  = admin
//   2  = worker, 10 = worker pcb
// Enforcement sesungguhnya tetap di backend (middleware 'admin'); helper ini
// hanya menyembunyikan menu/route agar UI konsisten.

export const ADMIN_LEVEL_IDS = [1];
export const WORKER_LEVEL_IDS = [2, 10];

// Menu sidebar yang hanya boleh tampil untuk admin.
export const ADMIN_ONLY_MENU_PATHS = ['/users', '/letters'];

function levelOf(user) {
  const level = Number(user?.id_level);
  return Number.isInteger(level) ? level : null;
}

export function isAdmin(user) {
  const level = levelOf(user);
  return level !== null && ADMIN_LEVEL_IDS.includes(level);
}

export function isWorker(user) {
  const level = levelOf(user);
  return level !== null && WORKER_LEVEL_IDS.includes(level);
}
