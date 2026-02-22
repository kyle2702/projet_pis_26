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
    // Désactiver source maps en production
    sourcemap: false,
    // Minification optimale avec esbuild (plus rapide que terser)
    minify: 'esbuild',
    // Taille de chunk optimale pour le cache
    chunkSizeWarningLimit: 1000,
    // Optimisations Rollup
    rollupOptions: {
      // Exclure le service worker du bundle
      external: ['/firebase-messaging-sw.js'],
      output: {
        // Code splitting optimisé
        manualChunks: {
          // Bibliothèques React dans un chunk séparé
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Firebase dans un chunk séparé
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/messaging'],
          // FullCalendar dans un chunk séparé
          'calendar-vendor': [
            '@fullcalendar/react',
            '@fullcalendar/daygrid',
            '@fullcalendar/timegrid',
            '@fullcalendar/list',
            '@fullcalendar/interaction'
          ]
        },
        // Nommage des chunks pour meilleur cache
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    // Optimisation du CSS
    cssMinify: true,
    // Réduire le nombre de chunks CSS
    cssCodeSplit: true,
    // Optimiser les assets
    assetsInlineLimit: 4096, // inline les assets < 4kb
    // Compresser les gros fichiers
    reportCompressedSize: true
  },
  // Optimisations globales
  esbuild: {
    // Retirer les console.log en production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  }
})
