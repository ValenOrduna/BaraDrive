import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: 'mapa-r3-evidencia.spec.js', outputDir: 'test-results',
  workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5462', viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', args: ['--use-angle=metal'] } },
  webServer: [{ command: 'npm run dev -- --port 5462', url: 'http://127.0.0.1:5462', timeout: 60000 }],
});
