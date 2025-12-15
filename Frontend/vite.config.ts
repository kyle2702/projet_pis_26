import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Assurer que le service worker est servi avec les bons headers
    headers: {
      'Service-Worker-Allowed': '/'
    }
  },
  build: {
    rollupOptions: {
      // Exclure le service worker du bundle
      external: ['/firebase-messaging-sw.js']
    }
  }
})
