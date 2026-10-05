import axios from 'axios';

// Base URL resolution:
// - If VITE_API_URL is an absolute URL (e.g. http://127.0.0.1:8000), requests go
//   straight to Laravel (cross-origin, needs CORS + a cross-site session cookie).
// - If VITE_API_URL is empty/unset, requests stay same-origin and the Vite dev
//   proxy (see vite.config.js) forwards /api/* to Laravel. This is the default and
//   the recommended setup, because the Laravel session cookie then stays first-party
//   and works over plain HTTP without SameSite=None/Secure requirements.
const rawBaseUrl = (import.meta.env.VITE_API_URL || '').trim();
const baseURL = rawBaseUrl.replace(/\/+$/, '');

const api = axios.create({
  baseURL,
  // Required so the Laravel session cookie is sent on every API request.
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

// Response interceptor untuk error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;

      // Error tetap memakai `message` yang sama seperti sebelumnya agar
      // konsumen yang sudah ada (Login, dll.) tidak berubah. Yang ditambahkan
      // hanya metadata: status HTTP, `errors` per-field dari Laravel 422,
      // dan `code` untuk kasus seperti database read-only.
      const buildError = (fallback, useServerMessage = true) => {
        const err = new Error((useServerMessage && data?.message) || fallback);
        err.status = status;
        err.errors = data?.errors || null;
        err.code = data?.code || null;
        return Promise.reject(err);
      };

      if (status === 401) {
        // Unauthenticated - bisa dihandle di AuthContext
        return buildError('Unauthenticated');
      }

      if (status === 422) {
        // Validation error
        return buildError('Validation failed');
      }

      if (status === 500) {
        return buildError('Server error. Please try again later.', false);
      }

      return buildError('An error occurred');
    }
    
    if (error.request) {
      // Request made but no response
      return Promise.reject(new Error('Cannot connect to server. Please check your connection.'));
    }
    
    return Promise.reject(new Error('An error occurred'));
  }
);

export default api;
