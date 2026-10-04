/**
 * Tests de bout en bout (Playwright) sur la vraie pile : Django/Daphne +
 * PostGIS + Redis + interface Vite. Voir README.md, « Tests de bout en bout ».
 *
 * Le backend tourne sur une base dédiée, recréée à chaque campagne
 * (backend/scripts/e2e_server.py) : la base de développement n'est jamais touchée.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? '8010'
const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT ?? '3100'

const backendDir = fileURLToPath(new URL('../backend', import.meta.url))
const venvPython = join(backendDir, ...(process.platform === 'win32' ? ['venv', 'Scripts', 'python.exe'] : ['venv', 'bin', 'python']))
const python = process.env.E2E_PYTHON ?? (existsSync(venvPython) ? `"${venvPython}"` : 'python')

export default defineConfig({
  testDir: './e2e',
  // Les scénarios partagent la même base (ambulances, lits) : exécution en série.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    locale: 'fr-SN',
    timezoneId: 'Africa/Dakar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // Navigateur installé sur le poste (ex. « msedge », « chrome ») plutôt que
        // celui de Playwright : PLAYWRIGHT_CHANNEL=msedge npm run test:e2e
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
  ],
  webServer: [
    {
      command: `${python} scripts/e2e_server.py`,
      cwd: backendDir,
      url: `http://127.0.0.1:${BACKEND_PORT}/api/health/`,
      env: { E2E_BACKEND_PORT: BACKEND_PORT },
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
      url: `http://127.0.0.1:${FRONTEND_PORT}/login`,
      env: { VITE_DEV_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}` },
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
