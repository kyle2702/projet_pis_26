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
        // Code splitting optimisé.
        // Une fonction plutôt qu'un objet: la forme objet embarquait TOUT ce qui
        // était listé, y compris `firebase/storage` (importé nulle part) et
        // `firebase/messaging`, qui se retrouvaient donc dans le chunk critique du
        // premier rendu.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const path = id.replace(/\\/g, '/');
          // Messaging (notifications): chunk à part, chargé seulement quand la
          // permission de notifications est accordée.
          if (path.includes('/@firebase/messaging/') || path.includes('/firebase/messaging/')) {
            return 'firebase-messaging';
          }
          if (path.includes('/@firebase/') || path.includes('/firebase/')) return 'firebase-vendor';
          if (path.includes('/@fullcalendar/')) return 'calendar-vendor';
          if (path.includes('/react-router')) return 'router-vendor';
          if (path.includes('/react-dom/') || path.includes('/react/') || path.includes('/scheduler/')) {
            return 'react-vendor';
          }
          return;
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
