import { defineConfig } from '@playwright/test';

const devPort = process.env.BARADRIVE_DEV_PORT ?? '5173';
const previewPort = process.env.BARADRIVE_PREVIEW_PORT ?? '4173';
const devUrl = `http://127.0.0.1:${devPort}`;
const previewUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: '**/mapa-r*-evidencia.spec.js',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: devUrl,
    viewport: { width: 1440, height: 900 },
    browserName: 'chromium',
    channel: process.env.BARADRIVE_BROWSER ? undefined : 'msedge',
    launchOptions: { executablePath: process.env.BARADRIVE_BROWSER, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: `npm run dev -- --port ${devPort}`, url: devUrl, timeout: 60_000, reuseExistingServer: false },
    { command: `npm run preview -- --port ${previewPort}`, url: previewUrl, timeout: 60_000, reuseExistingServer: false },
  ],
});
