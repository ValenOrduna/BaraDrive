import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'mapa-r2-evidencia.spec.js',
  outputDir: '../../mapa-ronda2-evidencia/playwright',
  timeout: 90_000,
  workers: 1,
  use: {
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      args: ['--use-angle=metal'],
    },
  },
  webServer: [
    { command: 'npm run preview -- --port 4352', url: 'http://127.0.0.1:4352' },
    { command: 'npm run preview -- --port 4353', url: 'http://127.0.0.1:4353', cwd: resolve('../../integracion-r1/juego') },
  ],
});
