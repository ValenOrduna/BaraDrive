import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Scene, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EMPTY_INPUT, FIXED_STEP } from '../src/game/config.js';
import { Vehicle } from '../src/game/Vehicle.js';
import { addMapToWorld } from '../src/game/World.js';
import { restoreMapCoordinates } from '../src/game/TrackSpawn.js';

const bytes = await readFile(new URL('../public/maps/san-martin.glb', import.meta.url));
// La prueba usa los nodos y las mallas reales. Rapier no necesita decodificar texturas.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
globalThis.ProgressEvent ??= class {};
const map = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
await RAPIER.init();

function fixture(t, orientation) {
  const scene = new Scene();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  t.after(() => world.free());
  world.timestep = FIXED_STEP;
  const group = map.scene.clone();
  const marker = group.getObjectByName('spawn');
  if (orientation) marker.quaternion.copy(orientation);
  const expectedSpawn = {
    position: marker.getWorldPosition(new Vector3()),
    rotation: marker.getWorldQuaternion(new Quaternion()),
  };
  const { obstacles, updateSignals } = addMapToWorld(scene, world, RAPIER, group);
  const spawn = restoreMapCoordinates(scene, world);
  const car = new Vehicle(RAPIER, world, spawn);
  const step = (controls = EMPTY_INPUT) => {
    car.beforeStep(FIXED_STEP, controls);
    world.step();
    car.afterStep();
  };
  return { world, group, obstacles, car, step, spawn, expectedSpawn, updateSignals };
}

test('el chasis arranca y vuelve al spawn del GLB con su posición y rumbo', (t) => {
  const orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.23);
  const { car, expectedSpawn, step } = fixture(t, orientation);
  const assertPose = () => {
    assert.ok(car.position.distanceTo(expectedSpawn.position) < 1e-5);
    assert.ok(car.rotation.angleTo(expectedSpawn.rotation) < 1e-5);
    assert.ok(new Vector3().copy(car.body.translation()).distanceTo(expectedSpawn.position) < 1e-5);
    assert.ok(new Quaternion().copy(car.body.rotation()).angleTo(expectedSpawn.rotation) < 0.001);
    assert.equal(car.speedKmh, 0);
  };
  assertPose();
  for (let tick = 0; tick < 100; tick++) step({ ...EMPTY_INPUT, throttle: true });
  assert.ok(car.position.distanceTo(expectedSpawn.position) > 1);
  car.reset();
  assertPose();
  for (let tick = 0; tick < 60; tick++) step();
  assert.ok(car.wheelTelemetry().every(({ contact }) => contact));
});

test('el recorrido con el GLB llega a Santa María de Oro en menos de 16 s de simulación', (t) => {
  const { car, step, spawn } = fixture(t);
  for (let tick = 0; tick < 60; tick++) step();
  const distance = 136.79 - 24.5;
  const drive = { ...EMPTY_INPUT, throttle: true };
  let ticks = 0;
  while (ticks < 16 / FIXED_STEP && spawn.position.z - car.position.z < distance) {
    step(drive);
    ticks++;
  }
  assert.ok(spawn.position.z - car.position.z >= distance, `avance de ${spawn.position.z - car.position.z} m`);
  assert.ok(Math.abs(car.position.x - spawn.position.x) < 0.8);
  assert.ok(car.wheelTelemetry().every(({ contact }) => contact));
  t.diagnostic(`${(spawn.position.z - car.position.z).toFixed(2)} m en ${(ticks * FIXED_STEP).toFixed(2)} s simulados`);
});

test('cruza el acceso biselado al portón gris de San Martín a 15 km/h', (t) => {
  const { world, group, obstacles, car, step } = fixture(t);
  // Coordenadas del GLB en metros. z = 0 en el eje de Malabia.
  const start = group.localToWorld(new Vector3(-1.5, 0.52, -28.2));
  const up = new Vector3(0, 1, 0);
  const curbRotation = new Quaternion().setFromAxisAngle(up, -25 * Math.PI / 180);
  car.body.setTranslation(start, true);
  car.body.setRotation(curbRotation, true);
  for (let tick = 0; tick < 60; tick++) step();

  const rayAt = (x) => new RAPIER.Ray(
    group.localToWorld(new Vector3(x, 0.9, -37)),
    { x: 0, y: -1, z: 0 },
  );
  const cast = (x) => world.castRay(rayAt(x), 1, true, undefined, undefined, car.collider);
  const road = cast(2.35);
  assert.ok(road, 'debe haber calzada bajo el carril');
  const targetX = 4.27;
  const sidewalk = cast(targetX);
  assert.ok(sidewalk, 'debe haber vereda al este');
  const curbHeight = road.timeOfImpact - sidewalk.timeOfImpact;
  assert.ok(curbHeight >= 0.095 && curbHeight <= 0.18, `altura de cordón ${curbHeight} m`);

  const ramp = cast(3.75);
  assert.ok(ramp && ramp.collider.handle !== road.collider.handle, 'debe haber un bisel entre calzada y vereda');
  assert.ok(sidewalk.timeOfImpact < ramp.timeOfImpact && ramp.timeOfImpact < road.timeOfImpact);
  const goal = group.localToWorld(new Vector3(targetX, 0.52, -37));
  const rideHeight = car.position.y;
  let crossingSpeed;
  let shortest = car.wheelTelemetry()[1].suspensionLength;
  const rest = shortest;
  const rightWheels = [1, 3];
  const touched = new Set();
  for (let tick = 0; tick < 260 && car.position.x < goal.x; tick++) {
    const before = car.speedKmh;
    step({ ...EMPTY_INPUT, throttle: before < 15 });
    for (const wheel of rightWheels) {
      if (car.controller.wheelGroundObject(wheel)?.handle === ramp.collider.handle) {
        touched.add(wheel);
        if (wheel === 1) {
          crossingSpeed ??= before;
          shortest = Math.min(shortest, car.wheelTelemetry()[wheel].suspensionLength);
        }
      }
    }
    world.contactPairsWith(car.collider, (collider) => {
      assert.ok(!obstacles.has(collider.handle), 'la trayectoria libre no debe tocar un edificio ni un límite');
    });
  }

  assert.ok(crossingSpeed >= 14 && crossingSpeed <= 16, `entrada al cordón a ${crossingSpeed} km/h`);
  assert.equal(touched.size, 2, 'las dos ruedas derechas deben cruzar el bisel');
  assert.ok(car.position.x >= goal.x, 'el vehículo debe avanzar sobre el cordón');
  assert.ok(car.position.y > rideHeight + 0.035, 'el chasis debe elevarse');
  assert.ok(rest - shortest > 0.03, 'la rueda delantera debe comprimir al montar el cordón');
  t.diagnostic(`Cordón ${(curbHeight * 100).toFixed(1)} cm, entrada ${crossingSpeed.toFixed(2)} km/h, compresión ${((rest - shortest) * 100).toFixed(1)} cm`);
});

test('los dos cabezales de Malabia alternan rojo, verde y ámbar', (t) => {
  const { group, updateSignals } = fixture(t);
  const lenses = new Map();
  group.traverse((object) => {
    const suffix = object.material?.name.match(/^MAT_SM_luz_(roja|ambar|verde)$/)?.[1];
    if (suffix) lenses.set(suffix, object.material);
  });
  assert.equal(lenses.size, 3, 'el GLB debe incluir las tres lentes');
  for (const [seconds, phase] of [[0, 'roja'], [15, 'verde'], [30, 'ambar'], [33, 'roja']]) {
    updateSignals(seconds);
    const active = [...lenses].filter(([, material]) => material.emissiveIntensity > 0);
    assert.deepEqual(active.map(([lens]) => lens), [phase]);
  }
});
