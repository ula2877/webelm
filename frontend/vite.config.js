import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Where the Vite dev proxy forwards /api and /storage.
//   - Backend ONLINE  : 'https://new-backend.elmechtechnology.com'
//   - Backend LOKAL   : 'http://127.0.0.1:8000'
const API_TARGET = 'https://new-backend.elmechtechnology.com'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      // Serves uploaded profile photos (backend/public/storage -> storage/app/public).
      '/storage': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
