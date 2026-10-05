import api from './api';

export async function login(username, password) {
  const response = await api.post('/api/login', { username, password });
  return response.data;
}

export async function logout() {
  const response = await api.post('/api/logout');
  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get('/api/me');
  return response.data;
}
