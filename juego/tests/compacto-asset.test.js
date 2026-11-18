import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WHEEL_MOUNTS } from '../src/game/config.js';

const path = new URL('../src/assets/compacto.glb', import.meta.url);

test('el GLB del compacto tiene cuatro pivotes independientes alineados a los ejes físicos', async () => {
  const bytes = await readFile(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  const { scene, scenes, nodes } = JSON.parse(bytes.toString('utf8', 20, jsonEnd));
  const roots = scenes[scene].nodes.map((index) => nodes[index]);
  assert.equal(roots.length, 5);
  assert.ok(roots.some(({ name }) => name === 'vehicle_chassis'));
  for (const { name, x, z } of WHEEL_MOUNTS) {
    const wheel = roots.find((node) => node.name === name);
    assert.ok(wheel, name);
    const [wheelX, wheelY, wheelZ] = wheel.translation;
    assert.equal(wheelX, x);
    assert.equal(wheelZ, z);
    assert.ok(wheelY < 0);
    const [spinning, stationary] = wheel.children.map((index) => nodes[index]);
    assert.equal(spinning.name, `${name}_spin`);
    assert.equal(stationary.name, `${name}_brake`);
    assert.ok(nodes[spinning.children[0]].children.length > 1);
    assert.equal(stationary.children.length, 1);
  }
});
