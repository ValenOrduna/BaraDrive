import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const evidence = resolve('../../mapa-ronda2-evidencia');
const beforeFile = resolve(evidence, 'base.glb');

function atStation(glb, station) {
  const size = glb.readUInt32LE(12);
  const manifest = JSON.parse(glb.subarray(20, 20 + size));
  manifest.nodes.find((node) => node.name === 'spawn').translation[2] = -station;
  const json = Buffer.from(JSON.stringify(manifest));
  const pad = Buffer.alloc((4 - json.length % 4) % 4, ' ');
  const header = Buffer.from(glb.subarray(0, 20));
  header.writeUInt32LE(json.length + pad.length, 12);
  const result = Buffer.concat([header, json, pad, glb.subarray(20 + size)]);
  result.writeUInt32LE(result.length, 8);
  return result;
}
const start = async (page, port) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.locator('#play')).toBeEnabled({ timeout: 25_000 });
  await page.locator('#play').click();
  await expect(page.locator('#error')).toBeHidden();
};
for (const [name, port, file] of [['antes', 4353, beforeFile], ['despues', 4352, 'public/maps/san-martin.glb']]) {
  for (const [location, station] of [['malabia', -1], ['fachadas', 29], ['toldos', 98], ['capri', 134]]) {
    test(`${location} — ${name}`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (event) => { if (event.type() === 'error') errors.push(event.text()); });
      await page.route('**/maps/san-martin.glb', async (route) => {
        await route.fulfill({ body: atStation(await readFile(file), station), contentType: 'model/gltf-binary' });
      });
      await start(page, port);
      await page.evaluate(() => new Promise((done) => {
        let frames = 0;
        const tick = () => ++frames === 24 ? done() : requestAnimationFrame(tick);
        requestAnimationFrame(tick);
      }));
      await page.screenshot({ path: resolve(evidence, `${location}-${name}.png`) });
      expect(errors).toEqual([]);
    });
  }
}
test('FPS de San Martín con Brave y GPU', async ({ page }) => {
  await start(page, 4352);
  const driver = await page.locator('canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  });
  expect(driver).toMatch(/Metal|Apple/);
  const fps = () => page.evaluate(() => new Promise((done) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      const seconds = (performance.now() - start) / 1000;
      if (seconds >= 3) done(frames / seconds);
      else {
        frames++;
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }));
  const idle = await fps();
  await page.keyboard.down('KeyW');
  const driving = await fps();
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyC');
  const interior = await fps();
  console.log(JSON.stringify({ driver, idle, driving, interior }));
});
