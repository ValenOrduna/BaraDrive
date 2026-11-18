import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const evidence = resolve(process.env.EVIDENCIA ?? '../../mapa-ronda3-evidencia');

test('Baradero completo: recorrido, capturas y FPS con GPU', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 60_000 });
  await page.locator('#spawn-select').selectOption({ index: Number(process.env.SALIDA ?? 0) });
  await page.locator('#play').click();
  const snap = () => page.evaluate(() => window.__BARA_DRIVE__.snapshot());
  const fps = () => page.evaluate(() => new Promise((done) => {
    let n = 0; const t0 = performance.now();
    const tick = () => (performance.now() - t0 >= 2000 ? done(n / 2) : (n++, requestAnimationFrame(tick)));
    requestAnimationFrame(tick);
  }));
  const first = await snap();
  const report = { map: first.map, fps: [] };
  await page.keyboard.down('KeyW');
  let shot = 0;
  let last = first.position;
  const prefix = process.env.PREFIJO ?? 'recorrido';
  for (let i = 0; i < 160 && shot < 8; i++) {
    await page.waitForTimeout(1500);
    const s = await snap();
    if (Math.hypot(s.position.x - last.x, s.position.z - last.z) > 55) {
      last = s.position;
      await page.screenshot({ path: resolve(evidence, `${prefix}-${++shot}.png`) });
      report.fps.push({ at: [Math.round(s.position.x), Math.round(s.position.z)], calls: s.frame.calls, tris: s.frame.triangles });
    }
    if (s.speed < 3 && i > 6) { await page.keyboard.press('KeyD'); }
  }
  await page.keyboard.up('KeyW');
  report.idleFps = await fps();
  await page.keyboard.down('KeyW');
  report.drivingFps = await fps();
  report.final = await snap();
  console.log(JSON.stringify({ ...report, final: { p: report.final.position, kmh: report.final.speed }, errors }));
  expect(errors).toEqual([]);
});
