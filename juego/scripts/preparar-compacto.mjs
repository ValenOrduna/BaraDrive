import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { VEHICLE, WHEEL_MOUNTS } from '../src/game/config.js';

const [sourcePath, targetPath] = process.argv.slice(2);
if (!sourcePath || !targetPath || sourcePath === targetPath) {
  throw new Error('Uso: node scripts/preparar-compacto.mjs compacto-original.glb src/assets/compacto.glb');
}

const source = await readFile(sourcePath);
const fingerprint = createHash('sha256').update(source).digest('hex');
if (fingerprint !== 'b5b7b28d4746b025a1d10ffd1d1682cfd7bea54af2ae9144ca88003487f4978a') {
  throw new Error('El GLB de entrada debe ser la versión de Innerscene indicada en docs/compacto.md.');
}

const jsonEnd = 20 + source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, jsonEnd).toString());
const scene = gltf.scenes[gltf.scene];
const [original] = scene.nodes;
const originalRoot = gltf.nodes[original];
const append = (node) => gltf.nodes.push(node) - 1;

const axis = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
const scale = new Vector3(VEHICLE.trackWidth / 1.550, VEHICLE.wheelRadius / 0.316, VEHICLE.wheelbase / 2.583);
const restY = -0.165;
const alignment = new Matrix4().makeTranslation(0, restY - VEHICLE.wheelRadius, -0.059 * scale.z);
alignment.multiply(new Matrix4().makeScale(...scale));
alignment.multiply(new Matrix4().makeRotationFromQuaternion(axis));

const originalOffset = new Matrix4().makeTranslation(...originalRoot.translation);
const originalToVehicle = alignment.clone().multiply(originalOffset);
const body = [];
const wheels = WHEEL_MOUNTS.map(() => ({ spinning: [], brakes: [] }));
const wheelPart = /^(107 reused |Siped tread blocks|Brake caliper|Brake rotor hat|Rotor drill recess|Ventilated brake rotor)/;

for (const child of originalRoot.children) {
  const node = gltf.nodes[child];
  if (!wheelPart.test(node.name)) {
    body.push(child);
    continue;
  }
  const primitive = gltf.meshes[node.mesh].primitives[0];
  const { min, max } = gltf.accessors[primitive.attributes.POSITION];
  const local = new Matrix4().compose(
    new Vector3(...(node.translation ?? [0, 0, 0])),
    new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
    new Vector3(...(node.scale ?? [1, 1, 1])),
  );
  const center = new Vector3(...min).lerp(new Vector3(...max), 0.5)
    .applyMatrix4(local).applyMatrix4(originalToVehicle);
  const index = (center.z > 0 ? 2 : 0) + (center.x > 0 ? 1 : 0);
  const parts = node.name.startsWith('Brake caliper') ? wheels[index].brakes : wheels[index].spinning;
  parts.push(child);
}

originalRoot.children = body;
const chassis = append({ name: 'vehicle_chassis', matrix: alignment.toArray(), children: [original] });
const pivots = WHEEL_MOUNTS.map(({ x, z, name }, i) => {
  const { spinning, brakes } = wheels[i];
  if (!spinning.length || brakes.length !== 1) throw new Error(`Rueda incompleta: ${name}`);
  const local = new Matrix4().makeTranslation(-x, -restY, -z).multiply(originalToVehicle).toArray();
  const spin = append({ name: `${name}_spin`, children: [
    append({ matrix: local, children: spinning }),
  ] });
  const caliper = append({ name: `${name}_brake`, matrix: local, children: brakes });
  return append({ name, translation: [x, restY, z], children: [spin, caliper] });
});
scene.nodes = [chassis, ...pivots];
gltf.asset.extras = {
  ...gltf.asset.extras,
  source: 'https://www.innerscene.com/tools/library/3d-parts/blue-five-door-compact-hatchback-5b95b2a0',
  license: 'CC0-1.0',
};

const payload = Buffer.from(JSON.stringify(gltf));
const padding = Buffer.alloc((4 - payload.length % 4) % 4, 0x20);
const binary = source.subarray(jsonEnd);
const header = Buffer.from(source.subarray(0, 20));
header.writeUInt32LE(header.length + payload.length + padding.length + binary.length, 8);
header.writeUInt32LE(payload.length + padding.length, 12);
await writeFile(targetPath, Buffer.concat([header, payload, padding, binary]));
