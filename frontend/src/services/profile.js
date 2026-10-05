import api from './api';

// Semua endpoint profil bekerja pada row tb_user milik user yang sedang login
// dan bergantung pada session cookie Laravel yang sudah berjalan.

export async function updateProfile({ username, nama }) {
  const response = await api.post('/api/profile', { username, nama });
  return response.data;
}

export async function changePassword({ current_password, password, password_confirmation }) {
  const response = await api.post('/api/profile/password', {
    current_password,
    password,
    password_confirmation,
  });
  return response.data;
}

export async function uploadPhoto(file) {
  const formData = new FormData();
  formData.append('foto', file);

  const response = await api.post('/api/profile/photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
}