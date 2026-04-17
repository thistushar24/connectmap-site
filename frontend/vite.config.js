import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // All API calls (including /api/client/*) go to the backend.
      // The backend handles Python client proxying silently — no 502s here.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // /client-api proxy REMOVED — now handled by /api/client/* via backend
    },
  },
})
