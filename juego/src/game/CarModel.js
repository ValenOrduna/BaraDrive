import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import modelUrl from '../assets/compacto.glb?url';
import lightUrl from '../assets/cielo-exterior.hdr?url';
import { WHEEL_MOUNTS } from './config.js';
import { createInstruments } from './Instruments.js';
import { createCabinSurfaces, setCarSurfaces, shapeHatch, vertexShading } from './CarSurfaces.js';

function collectMeshes(node, keep = () => true) {
  const meshes = [];
  node.traverse((object) => {
    if (object.isMesh && keep(object)) meshes.push(object);
  });
  return meshes;
}

function batchMeshes(pieces, origin, environment, reshape = false) {
  const byMaterial = new Map();
  const group = new THREE.Group();
  for (const piece of pieces) {
    const geometry = piece.geometry.clone().applyMatrix4(piece.matrixWorld);
    if (reshape) {
      if (piece.material.vertexColors) {
        vertexShading(geometry, (x, y) =>
          0.48 + 0.42 * THREE.MathUtils.smoothstep(y, 0.02, 0.55)
            + 0.10 * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.48, 0.75)));
      } else {
        shapeHatch(geometry, piece.name === 'Roof_spoiler_lip');
      }
    }
    geometry.translate(-origin.x, -origin.y, -origin.z);
    if (!byMaterial.has(piece.material)) byMaterial.set(piece.material, []);
    byMaterial.get(piece.material).push(geometry);
  }
  for (const [material, geometries] of byMaterial) {
    material.envMap = environment;
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = !material.transparent && !material.transmission;
    mesh.receiveShadow = !material.transparent;
    geometries.forEach((geometry) => geometry.dispose());
    group.add(mesh);
  }
  group.position.copy(origin);
  return group;
}

function createWheelTrim(environment) {
  const alloy = new THREE.MeshStandardMaterial({
    color: '#abb5bb', metalness: 0.88, roughness: 0.24, envMap: environment, envMapIntensity: 1.22,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: '#363a39', roughness: 0.79 });
  const bead = new THREE.TorusGeometry(0.208, 0.003, 8, 72).rotateY(Math.PI / 2);
  const ribs = mergeGeometries([0.254, 0.278].map((radius) =>
    new THREE.TorusGeometry(radius, 0.0019, 6, 72).rotateY(Math.PI / 2)));
  return function addTrim(spin, side) {
    const polished = new THREE.Mesh(bead, alloy);
    polished.position.x = side * 0.102;
    const sidewall = new THREE.Mesh(ribs, rubber);
    sidewall.position.x = side * 0.104;
    spin.add(polished, sidewall);
  };
}

function createSteeringWheel(center, grain) {
  const housing = new THREE.Group();
  housing.position.copy(center);
  housing.position.y += 0.026;
  housing.position.z -= 0.022;
  housing.rotation.x = -0.52;
  const wheel = new THREE.Group();
  housing.add(wheel);

  const grip = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.84, bumpMap: grain, bumpScale: 0.0007 });
  const plastic = new THREE.MeshStandardMaterial({ color: '#24272c', roughness: 0.72 });
  const satin = new THREE.MeshStandardMaterial({ color: '#686c73', metalness: 0.22, roughness: 0.52 });
  const button = new THREE.MeshStandardMaterial({ color: '#393d43', roughness: 0.78 });
  function add(geometry, material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    wheel.add(mesh);
    return mesh;
  }
  add(new THREE.TorusGeometry(0.164, 0.016, 16, 64), grip);
  const sideSpoke = new RoundedBoxGeometry(0.125, 0.050, 0.026, 4, 0.011);
  const buttonGeometry = new RoundedBoxGeometry(0.019, 0.014, 0.005, 2, 0.002);
  for (const side of [-1, 1]) {
    add(sideSpoke, plastic, 0.096 * side, 0.009, -0.008).rotation.z = 0.10 * side;
    for (const y of [-0.001, 0.017]) add(buttonGeometry, button, 0.112 * side, y, 0.007);
  }
  add(new RoundedBoxGeometry(0.052, 0.107, 0.026, 4, 0.011), satin, 0, -0.107, -0.01);
  add(new RoundedBoxGeometry(0.141, 0.095, 0.040, 5, 0.020), plastic, 0, -0.008, 0.003);
  return { housing, wheel };
}

export async function createCarModel() {
  const [{ scene }, environment] = await Promise.all([
    new GLTFLoader().loadAsync(modelUrl),
    new HDRLoader().loadAsync(lightUrl),
  ]);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  scene.updateMatrixWorld(true);
  const group = new THREE.Group();
  const chassis = scene.getObjectByName('vehicle_chassis');
  const steeringRim = chassis?.getObjectByName('Steering_rim');
  if (!steeringRim) throw new Error('El modelo del compacto debe incluir el chasis y el volante.');

  const allMeshes = collectMeshes(scene);
  const cabinSurfaces = createCabinSurfaces();
  const { grain } = cabinSurfaces;
  const brakeLights = setCarSurfaces(allMeshes, cabinSurfaces);
  const bodyPieces = collectMeshes(chassis, (object) => !/^(Steering_|Wiper_(arm|rubber))/.test(object.name));
  group.add(batchMeshes(bodyPieces, new THREE.Vector3(), environment, true));
  const addTrim = createWheelTrim(environment);
  const wheels = WHEEL_MOUNTS.map(({ name, x }) => {
    const wheel = scene.getObjectByName(name);
    const wheelSpin = wheel?.getObjectByName(`${name}_spin`);
    const wheelBrake = wheel?.getObjectByName(`${name}_brake`);
    if (!wheelSpin || !wheelBrake) throw new Error(`Faltan piezas del modelo en ${name}.`);
    const origin = wheel.getWorldPosition(new THREE.Vector3());
    const pivot = batchMeshes(collectMeshes(wheelBrake), origin, environment);
    const spin = batchMeshes(collectMeshes(wheelSpin), origin, environment);
    pivot.name = name;
    spin.name = wheelSpin.name;
    spin.position.set(0, 0, 0);
    addTrim(spin, Math.sign(x));
    pivot.add(spin);
    group.add(pivot);
    return { pivot, spin };
  });
  const steering = createSteeringWheel(steeringRim.getWorldPosition(new THREE.Vector3()), grain);
  group.add(steering.housing);
  const originalGeometries = new Set(allMeshes.map(({ geometry }) => geometry));
  originalGeometries.forEach((geometry) => geometry.dispose());

  const trim = new THREE.MeshStandardMaterial({ color: '#22252b', roughness: 0.83 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#858b93', metalness: 0.54, roughness: 0.41 });
  const cockpit = new THREE.Group();
  const dashboardSkin = new THREE.MeshStandardMaterial({
    color: '#353b3f', roughness: 0.90, roughnessMap: grain, bumpMap: grain,
    bumpScale: 0.0015, vertexColors: true,
  });
  const dashShape = new RoundedBoxGeometry(1.34, 0.137, 0.365, 5, 0.061);
  vertexShading(dashShape, (x, y, z) =>
    0.57 + 0.28 * THREE.MathUtils.smoothstep(y, -0.06, 0.04)
      + 0.15 * THREE.MathUtils.smoothstep(z, -0.18, -0.02));
  const dash = new THREE.Mesh(dashShape, dashboardSkin);
  dash.position.set(0, 0.407, -0.806);
  dash.rotation.x = -0.08;
  cockpit.add(dash);
  const accent = new THREE.Mesh(new RoundedBoxGeometry(1.10, 0.014, 0.015, 3, 0.005), chrome);
  accent.position.set(0.05, 0.395, -0.626);
  cockpit.add(accent);
  const instruments = createInstruments(grain);
  cockpit.add(instruments.group);

  const ventGeometry = new RoundedBoxGeometry(0.105, 0.040, 0.018, 3, 0.007);
  const slatGeometry = new THREE.BoxGeometry(0.078, 0.002, 0.008);
  for (const x of [-0.571, 0.014, 0.135, 0.545]) {
    const vent = new THREE.Mesh(ventGeometry, trim);
    vent.position.set(x, 0.438, -0.624);
    cockpit.add(vent);
    for (const offset of [-0.010, 0, 0.010]) {
      const slat = new THREE.Mesh(slatGeometry, chrome);
      slat.position.set(x, 0.438 + offset, -0.612);
      cockpit.add(slat);
    }
  }

  // Un retrovisor interior de baja resolución evita tres pasadas de escena por cuadro.
  const target = new THREE.WebGLRenderTarget(256, 72);
  target.texture.repeat.x = -1;
  target.texture.offset.x = 1;
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.238, 0.068, 0.025, 4, 0.014), trim);
  housing.position.set(-0.015, 0.88, -0.65);
  housing.rotation.x = 0.12;
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.208, 0.050), new THREE.MeshBasicMaterial({
    map: target.texture,
    toneMapped: false,
  }));
  mirror.position.set(0, 0, 0.014);
  housing.add(mirror);
  const mount = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.055, 0.032, 3, 0.006), trim);
  mount.position.set(0, 0.056, -0.016);
  housing.add(mount);
  cockpit.add(housing);
  group.add(cockpit);

  const mirrorCamera = new THREE.PerspectiveCamera(25, 256 / 72, 0.08, 125);
  const mirrorLook = new THREE.Vector3();
  let lastMirrorFrame = -Infinity;

  function updateMirror(renderer, world, time) {
    if (time - lastMirrorFrame < 64) return;
    lastMirrorFrame = time;
    mirrorCamera.position.set(0, 0.79, 2.13);
    mirrorLook.set(0, 0.45, 22);
    group.localToWorld(mirrorCamera.position);
    mirrorCamera.lookAt(group.localToWorld(mirrorLook));
    const activeTarget = renderer.getRenderTarget();
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      renderer.setRenderTarget(target);
      renderer.render(world, mirrorCamera);
    } finally {
      renderer.setRenderTarget(activeTarget);
      renderer.shadowMap.autoUpdate = shadowUpdate;
    }
  }

  function animate(vehicle, alpha) {
    wheels.forEach(({ pivot, spin }, i) => {
      const previous = vehicle.previousWheelPose[i];
      const current = vehicle.wheelPose[i];
      pivot.position.y = THREE.MathUtils.lerp(previous.y, current.y, alpha);
      pivot.rotation.y = THREE.MathUtils.lerp(previous.steering, current.steering, alpha);
      spin.rotation.x = THREE.MathUtils.lerp(previous.spin, current.spin, alpha);
    });
    steering.wheel.rotation.z = vehicle.steering * 9.5;
    for (const light of brakeLights) light.emissiveIntensity = vehicle.braking ? 2.0 : 0.035;
    instruments.update(vehicle);
  }

  return {
    group, animate, updateMirror,
    dispose() {
      target.dispose();
      environment.dispose();
      Object.values(cabinSurfaces).forEach((texture) => texture.dispose());
    },
  };
}
