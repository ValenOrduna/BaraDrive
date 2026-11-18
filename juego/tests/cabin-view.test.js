import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHASE_EYE, CHASE_TARGET, DRIVER_EYE, DRIVER_TARGET, FIELD_OF_VIEW, interiorFov } from '../src/game/Cameras.js';

globalThis.self ??= globalThis;
globalThis.ProgressEvent ??= class {};
const bytes = await readFile(new URL('../src/assets/compacto.glb', import.meta.url));
// Node no decodifica las texturas del GLB; la prueba solo usa la geometría.
const warn = console.warn;
console.warn = () => {};
const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
console.warn = warn;
scene.updateMatrixWorld(true);

function screenExtent(mesh, camera) {
  const { position } = mesh.geometry.attributes;
  const point = new Vector3();
  let right = -Infinity;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(camera);
    if (point.z < 1) right = Math.max(right, point.x);
  }
  return (right + 1) / 2;
}

test('el pilar A izquierdo queda fuera del 20 % izquierdo de la vista de cabina', (t) => {
  const pillar = scene.getObjectByName('Flush_pressed_A_pillar');
  assert.ok(pillar, 'falta el pilar A izquierdo del compacto');
  for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1080], [1280, 1024]]) {
    const camera = new PerspectiveCamera(interiorFov(width / height), width / height, 0.04, 270);
    camera.position.copy(DRIVER_EYE);
    camera.lookAt(DRIVER_TARGET.x, DRIVER_TARGET.y, DRIVER_TARGET.z);
    camera.updateMatrixWorld();
    const covered = screenExtent(pillar, camera);
    t.diagnostic(`${width}×${height}: pilar hasta ${(covered * 100).toFixed(1)} % del ancho`);
    assert.ok(covered <= 0.2, `${width}×${height}: ${(covered * 100).toFixed(1)} %`);
  }
});

test('la cámara exterior queda centrada detrás del auto', () => {
  const camera = new PerspectiveCamera(FIELD_OF_VIEW.exterior, 1440 / 900, 0.04, 270);
  camera.position.copy(CHASE_EYE);
  camera.lookAt(CHASE_TARGET.x, CHASE_TARGET.y, CHASE_TARGET.z);
  camera.updateMatrixWorld();
  const center = new Vector3(0, 0.7, 0).project(camera);
  assert.ok(Math.abs(center.x) < 0.01, `centro del auto en x=${center.x}`);
  assert.ok(CHASE_EYE.z > 4 && CHASE_EYE.y > 1.5, 'la cámara debe quedar detrás y arriba');
});
