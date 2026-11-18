import { test } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, MathUtils } from 'three';
import { Vehicle } from '../src/game/Vehicle.js';
import { EMPTY_INPUT, FIXED_STEP, SPAWN, VEHICLE } from '../src/game/config.js';

await RAPIER.init();

function fixture(t) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_STEP;
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0).setFriction(0.1));
  const car = new Vehicle(RAPIER, world);
  t.after(() => world.free());
  const step = (seconds, controls = {}) => {
    const input = { ...EMPTY_INPUT, ...controls };
    for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++) {
      car.beforeStep(FIXED_STEP, input);
      world.step();
      car.afterStep();
    }
  };
  step(1);
  return { world, car, step };
}

test('el auto se apoya en el suelo y acelera hacia su frente (-Z)', (t) => {
  const { car, step } = fixture(t);
  assert.ok(car.position.y > 0.45 && car.position.y < 0.6);
  step(3, { throttle: true });
  assert.ok(car.signedSpeed > 8, `velocidad ${car.signedSpeed}`);
  assert.ok(car.position.z < SPAWN.z - 12);
  assert.ok(Math.abs(car.position.x - SPAWN.x) < 0.1);
});

test('Espacio detiene el auto sin activar marcha atrás', (t) => {
  const { car, step } = fixture(t);
  step(3, { throttle: true });
  step(3, { brake: true });
  assert.ok(Math.abs(car.signedSpeed) < 0.1);
  assert.ok(car.position.y > 0.4);
});

test('S primero frena y luego permite retroceder; W vuelve a avanzar', (t) => {
  const { car, step } = fixture(t);
  step(2, { throttle: true });
  const forwardSpeed = car.signedSpeed;
  step(0.3, { reverse: true });
  assert.ok(car.signedSpeed < forwardSpeed && car.signedSpeed > 0);
  step(4, { reverse: true });
  assert.ok(car.signedSpeed < -2);
  step(3, { throttle: true });
  assert.ok(car.signedSpeed > 2);
});

test('la dirección cambia el rumbo y el agarre mantiene el auto estable', (t) => {
  const { car, step } = fixture(t);
  step(1.5, { throttle: true });
  step(2, { throttle: true, steer: 1 });
  assert.ok(car.position.x < SPAWN.x - 2, `posición X ${car.position.x}`);
  assert.ok(Math.abs(car.rotation.y) > 0.1);
  const attitude = new Euler().setFromQuaternion(car.rotation, 'YXZ');
  assert.ok(Math.abs(attitude.x) < 0.17 && Math.abs(attitude.z) < 0.17);
});

test('un obstáculo sólido detiene el auto incluso manteniendo acelerador', (t) => {
  const { world, car, step } = fixture(t);
  const wall = world.createCollider(RAPIER.ColliderDesc.cuboid(30, 3, 0.5).setTranslation(SPAWN.x, 3, 8));
  step(9, { throttle: true });
  assert.ok(car.position.z > 10, `atravesó el muro: Z=${car.position.z}`);
  assert.ok(car.speedKmh < 1, `no se detuvo: ${car.speedKmh}`);
  let contact = false;
  world.contactPairsWith(car.collider, (other) => { if (other.handle === wall.handle) contact = true; });
  assert.ok(contact, 'Rapier no registró contacto con el muro');
});

test('reiniciar limpia movimiento, giro y transformación', (t) => {
  const { car, step } = fixture(t);
  step(2, { throttle: true, steer: -1 });
  car.reset();
  assert.ok(Math.abs(car.position.x - SPAWN.x) < 1e-5);
  assert.ok(Math.abs(car.position.z - SPAWN.z) < 1e-5);
  assert.equal(car.speedKmh, 0);
  assert.equal(car.steering, 0);
  assert.equal(car.rotation.w, 1);
  assert.ok(car.wheelPose.every(({ steering, spin }) => steering === 0 && spin === 0));
  assert.ok(car.wheelTelemetry().every(({ contact, load }) => !contact && load === 0));
  step(1);
  assert.ok(Math.abs(car.position.z - SPAWN.z) < 0.02);
});

test('cuatro ruedas soportan el peso y la tracción actúa en el eje delantero', (t) => {
  const { car, step } = fixture(t);
  const wheels = car.wheelTelemetry();
  assert.ok(wheels.every(({ contact, load, lateralSpeed }) =>
    contact && load > 0 && Math.abs(lateralSpeed) < 0.01));
  const totalLoad = wheels.reduce((total, { load }) => total + load, 0);
  assert.ok(Math.abs(totalLoad / (VEHICLE.mass * 9.81) - 1) < 0.02);
  assert.ok(wheels[0].load + wheels[1].load > totalLoad / 2);
  step(FIXED_STEP, { throttle: true, steer: 1 });
  const { controller } = car;
  assert.ok(controller.wheelEngineForce(0) > 0 && controller.wheelEngineForce(1) > 0);
  assert.equal(controller.wheelEngineForce(2), 0);
  assert.equal(controller.wheelEngineForce(3), 0);
  assert.ok(controller.wheelSteering(0) > controller.wheelSteering(1));
  assert.equal(controller.wheelSteering(2), 0);
  assert.equal(controller.wheelSteering(3), 0);
});

test('una frenada recta desde 50 km/h transfiere carga al frente', (t) => {
  const { car, step } = fixture(t);
  car.body.setLinvel({ x: 0, y: 0, z: -50 / 3.6 }, true);
  const startZ = car.position.z;
  const { controller } = car;
  const frontLoad = () => controller.wheelSuspensionForce(0) + controller.wheelSuspensionForce(1);
  const initialLoad = frontLoad();
  let ticks = 0;
  let peakLoad = initialLoad;
  let peakPitch = 0;
  const attitude = new Euler();
  while (car.speedKmh > 0.3 && ticks < 180) {
    step(FIXED_STEP, { brake: true });
    ticks += 1;
    attitude.setFromQuaternion(car.rotation, 'YXZ');
    peakPitch = Math.max(peakPitch, -MathUtils.radToDeg(attitude.x));
    peakLoad = Math.max(peakLoad, frontLoad());
  }
  const distance = startZ - car.position.z;
  t.diagnostic(`Frenada: ${distance.toFixed(2)} m, ${(ticks * FIXED_STEP).toFixed(2)} s, cabeceo ${peakPitch.toFixed(2)}°`);
  assert.ok(car.speedKmh <= 0.3);
  assert.ok(distance > 9 && distance <= 11.70, `distancia de frenado ${distance} m`);
  assert.ok(peakPitch > 0.5 && peakPitch < 5);
  assert.ok(peakLoad > initialLoad * 1.15);
  assert.ok(Math.abs(car.position.x - SPAWN.x) < 0.05);
});

test('el giro cerrado a velocidad de maniobra tiene un radio estable', (t) => {
  const { car, step } = fixture(t);
  const attitude = new Euler();
  let arc = 0;
  let heading = 0;
  let maxRoll = 0;
  let speed = 0;
  const samples = 300;
  for (let i = 0; i < 120 + samples; i++) {
    const { x, z } = car.position;
    const yaw = attitude.setFromQuaternion(car.rotation, 'YXZ').y;
    step(FIXED_STEP, { throttle: car.signedSpeed < 2.8, steer: 1 });
    if (i < 120) continue;
    arc += Math.hypot(car.position.x - x, car.position.z - z);
    attitude.setFromQuaternion(car.rotation, 'YXZ');
    const delta = attitude.y - yaw;
    heading += Math.atan2(Math.sin(delta), Math.cos(delta));
    maxRoll = Math.max(maxRoll, Math.abs(MathUtils.radToDeg(attitude.z)));
    speed += car.speedKmh;
  }
  const radius = arc / Math.abs(heading);
  t.diagnostic(`Giro: radio de la trayectoria ${radius.toFixed(2)} m, velocidad media ${(speed / samples).toFixed(2)} km/h, balanceo ${maxRoll.toFixed(2)}°`);
  assert.ok(radius > 4.5 && radius < 7.5);
  assert.ok(maxRoll < 5);
});

test('el cordón de 10 cm comprime la suspensión del lado que lo cruza', (t) => {
  const { world, car, step } = fixture(t);
  const curb = world.createCollider(RAPIER.ColliderDesc.cuboid(0.75, 0.05, 1.5)
    .setTranslation(SPAWN.x + 0.75, 0.05, SPAWN.z - 5));
  const frontRight = 1;
  const rest = car.wheelTelemetry()[frontRight].suspensionLength;
  let shortest = rest;
  let touched = false;
  let maxRoll = 0;
  const attitude = new Euler();
  for (let i = 0; i < 330; i++) {
    step(FIXED_STEP, { throttle: car.signedSpeed < 2.5 });
    touched ||= car.controller.wheelGroundObject(frontRight)?.handle === curb.handle;
    shortest = Math.min(shortest, car.controller.wheelSuspensionLength(frontRight));
    attitude.setFromQuaternion(car.rotation, 'YXZ');
    maxRoll = Math.max(maxRoll, Math.abs(MathUtils.radToDeg(attitude.z)));
  }
  const compressionCm = (rest - shortest) * 100;
  t.diagnostic(`Cordón: compresión delantera derecha ${compressionCm.toFixed(1)} cm, balanceo ${maxRoll.toFixed(2)}°`);
  assert.ok(touched);
  assert.ok(compressionCm > 4);
  assert.ok(maxRoll > 1 && maxRoll < 10);
  assert.ok(car.position.z < SPAWN.z - 10);
  assert.ok(car.wheelTelemetry().every(({ contact }) => contact));
});

test('la tracción se limita a 60 km/h adelante y 15 km/h en reversa', (t) => {
  const { car, step } = fixture(t);
  for (const [input, limit, sign] of [
    [{ throttle: true }, 60, 1],
    [{ reverse: true }, 15, -1],
  ]) {
    car.reset();
    step(1);
    let peak = 0;
    for (let tick = 0; tick < 900; tick++) {
      step(FIXED_STEP, input);
      peak = Math.max(peak, car.signedSpeed * sign * 3.6);
    }
    t.diagnostic(`Velocidad sostenida: ${car.speedKmh.toFixed(2)} km/h (${sign > 0 ? 'adelante' : 'reversa'})`);
    assert.ok(peak <= limit + 0.1, `pico ${peak} km/h`);
    assert.ok(car.signedSpeed * sign * 3.6 >= limit - 1);
  }
});
