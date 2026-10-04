/**
 * Configuration Vite — interface web Jappo Dundu.
 *
 * En développement, `/api` et `/ws` sont relayés vers le backend Django :
 * le navigateur ne parle qu'à une seule origine, exactement comme en
 * production derrière Caddy (aucun réglage CORS nécessaire).
 *
 * Auteur : Serigne Mbacké Faye
 */
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_DEV_BACKEND_URL || 'http://127.0.0.1:8000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/ws': { target: backend.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
      },
    },
    preview: { port: 3000, strictPort: true },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
    },
  }
})
