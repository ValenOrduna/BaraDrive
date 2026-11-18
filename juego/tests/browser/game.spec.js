import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('la distribución compilada carga sin recursos externos y muestra el escenario', async ({ page }, testInfo) => {
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${process.env.BARADRIVE_PREVIEW_PORT ?? '4173'}`);
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('.scenario-note')).toContainText('Av. San Martín');
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('menu.png') });
  await page.locator('#play').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#speed').textContent())).toBeGreaterThan(12);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#speed')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('exterior.png') });
  await page.keyboard.press('KeyC');
  await expect(page.locator('#camera-label')).toHaveText('INTERIOR');
  await expect(page.locator('#speed')).toBeHidden();
  await expect(page.locator('#drive-status')).toBeInViewport();
  const status = await page.locator('#drive-status').boundingBox();
  expect(status.y).toBeLessThan(page.viewportSize().height / 4);
  await page.screenshot({ path: testInfo.outputPath('interior.png') });
  await page.keyboard.press('KeyC');
  await expect(page.locator('#speed')).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('teclado mueve, gira, frena, retrocede y reinicia; la pausa no acumula física', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#play').click();
  const snapshot = () => page.evaluate(() => window.__BARA_DRIVE__.snapshot());
  const start = await snapshot();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await snapshot()).position.z).toBeLessThan(start.position.z - 5);
  await page.keyboard.down('KeyA');
  await expect.poll(async () => (await snapshot()).position.x).toBeLessThan(start.position.x - 1);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snapshot()).speed).toBeLessThan(0.3);
  await page.keyboard.up('Space');
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await snapshot()).position.z).toBeCloseTo(start.position.z, 1);
  await page.keyboard.down('KeyS');
  await expect(page.locator('#gear')).toHaveText('R');
  await expect.poll(async () => (await snapshot()).position.z).toBeGreaterThan(start.position.z + 1);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  const paused = await snapshot();
  await page.waitForTimeout(450);
  expect((await snapshot()).position).toEqual(paused.position);
  await page.locator('#resume').click();
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await snapshot()).speed).toBeLessThan(0.1);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.keyboard.up('KeyW');
  await page.locator('#resume').click();
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(400);
  expect((await snapshot()).speed).toBeLessThan(0.1);
  expect(errors).toEqual([]);
});

test('si WebGL no está disponible informa el problema y permite reintentar', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).includes('webgl')) return null;
      return original.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#reload')).toBeEnabled();
  await expect(page.locator('#error-message')).toContainText('aceleración gráfica');
});

test('San Martín se recorre desde la salida de Malabia a Santa María de Oro', async ({ page }) => {
  // Con 2 FPS en software, el tope de 0,1 s por cuadro ralentiza el reloj físico.
  test.setTimeout(190_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const mapResponse = page.waitForResponse((response) => response.url().endsWith('/maps/san-martin.glb'));
  await page.goto('/');
  const map = await mapResponse;
  expect(map.ok()).toBe(true);
  // El inspector descarta cuerpos grandes; el servidor entrega este mismo archivo.
  const file = await readFile(new URL('../../public/maps/san-martin.glb', import.meta.url));
  const json = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  const marker = json.nodes.find(({ name }) => name === 'spawn');
  expect(marker).toBeDefined();
  const [x, y, z] = marker.translation;
  const rotation = marker.rotation ?? [0, 0, 0, 1];
  function distanceFromSpawn({ position }) {
    return Math.hypot(position.x - x, position.y - y, position.z - z);
  }
  function alignment({ rotation: current }) {
    const q = [current.x, current.y, current.z, current.w];
    return Math.abs(rotation.reduce((dot, value, i) => dot + value * q[i], 0));
  }
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#play').click();
  const snapshot = () => page.evaluate(() => window.__BARA_DRIVE__.snapshot());
  const start = await snapshot();
  expect(distanceFromSpawn(start)).toBeLessThan(0.08);
  expect(alignment(start)).toBeGreaterThan(0.999);
  await expect(page.locator('#heading')).toHaveText('NE');
  await page.keyboard.down('KeyW');
  // Entre ejes hay 136,79 m. La salida está 24,5 m pasada Malabia.
  await expect.poll(async () => {
    await expect(page.locator('#error')).toBeHidden();
    return (await snapshot()).position.z;
  }, { timeout: 150_000 }).toBeLessThan(start.position.z - 112.29);
  await page.keyboard.up('KeyW');
  const finish = await snapshot();
  expect(Math.abs(finish.position.x - start.position.x)).toBeLessThan(0.8);
  expect(finish.position.y).toBeGreaterThan(0.4);
  expect(errors).toEqual([]);
  await page.keyboard.press('KeyR');
  await expect.poll(async () => distanceFromSpawn(await snapshot())).toBeLessThan(0.08);
  expect(alignment(await snapshot())).toBeGreaterThan(0.999);
});
