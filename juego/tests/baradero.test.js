import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { Scene, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addCityToWorld } from '../src/game/World.js';
import { EMPTY_INPUT, FIXED_STEP, SPAWN } from '../src/game/config.js';
import { Vehicle } from '../src/game/Vehicle.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
globalThis.ProgressEvent ??= class {};
const root = new URL('../public/maps/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('baradero/index.json', root)));
const loader = new GLTFLoader();
async function load(name, expectedBytes) {
  const bytes = await readFile(new URL(name, root));
  if (expectedBytes) assert.equal(bytes.length, expectedBytes);
  return (await loader.parseAsync(Uint8Array.from(bytes).buffer, '')).scene;
}

test('carga el centro completo y prueba la calzada a lo largo de los 28 ejes', async (t) => {
  await RAPIER.init();
  const [sector, ...tiles] = await Promise.all([
    load('san-martin.glb'),
    ...manifest.chunks.map(({ file, bytes }) => load(`baradero/${file}`, bytes)),
  ]);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  t.after(() => world.free());
  world.timestep = FIXED_STEP;
  const { surfaceHandles, starts, tileBounds } = addCityToWorld(new Scene(), world, RAPIER, sector, tiles, manifest);
  const car = new Vehicle(RAPIER, world);
  world.step();
  assert.equal(manifest.crs, 'EPSG:32721');
  assert.equal(tileBounds.length, manifest.chunks.length);
  assert.deepEqual(new Set(surfaceHandles.values()), new Set(['road', 'curb', 'sidewalk', 'building', 'ground']));

  const missing = [];
  let samples = 0;
  const roadAt = (position) => {
    const ray = new RAPIER.Ray(position, { x: 0, y: -1, z: 0 });
    return world.castRay(ray, 2, true, undefined, undefined, undefined, undefined,
      (collider) => surfaceHandles.get(collider.handle) === 'road');
  };
  assert.equal(manifest.routes.length, 28);
  for (const { name, id, points } of manifest.routes) {
    for (let i = 1; i < points.length; i++) {
      const [a, b] = points[i - 1];
      const [x, z] = points[i];
      const count = Math.ceil(Math.hypot(x - a, z - b) / 5);
      for (let sample = 0; sample < count; sample++) {
        const fraction = (sample + 0.5) / count;
        const local = new Vector3(a + fraction * (x - a), 1, b + fraction * (z - b));
        const hit = roadAt(sector.localToWorld(local.clone()));
        if (!hit || Math.abs(hit.timeOfImpact - 0.99) > 0.003) missing.push([name, id, local.x, local.z]);
        samples++;
      }
    }
  }
  t.diagnostic(`${samples - missing.length}/${samples} muestras de calzada, ${tileBounds.length} teselas`);
  assert.equal(missing.length, 0, JSON.stringify(missing.slice(0, 15)));
  for (const start of starts) assert.ok(roadAt(start.pose().position), start.name);

  for (let tick = 0; tick < 1000 && SPAWN.z - car.position.z < 165; tick++) {
    car.beforeStep(FIXED_STEP, { ...EMPTY_INPUT, throttle: true });
    world.step();
    car.afterStep();
    if (tick % 100 === 0) t.diagnostic(JSON.stringify([tick, car.position.toArray(), car.speedKmh, car.wheelTelemetry().map(wheel => wheel.contact)]));
  }
  assert.ok(SPAWN.z - car.position.z >= 165, 'el auto debe atravesar el límite anterior de San Martín');
  assert.ok(car.wheelTelemetry().every(({ contact }) => contact));
});
