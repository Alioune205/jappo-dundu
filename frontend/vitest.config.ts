import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    // Tableaux de bord complets (toutes fonctions affichées) : le premier rendu
    // d'un fichier peut dépasser 5 s sur un poste chargé, en exécution parallèle.
    testTimeout: 15_000,
    // Les tests couvrent toutes les fonctions, y compris celles masquées par défaut.
    env: { VITE_FULL_FEATURES: 'true' },
  },
})
