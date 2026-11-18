import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const START = 0.75 * Math.PI;
const SWEEP = 1.5 * Math.PI;
const SCALE = 120;

function canvasFace(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { context: canvas.getContext('2d'), texture };
}

function makeSpeedDial() {
  const group = new THREE.Group();
  group.position.set(-0.077, 0, 0.048);
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.058, 0.0036, 12, 64),
    new THREE.MeshStandardMaterial({ color: '#555c62', metalness: 0.57, roughness: 0.42 }),
  );
  bezel.position.z = 0.006;
  group.add(bezel);

  const { context, texture } = canvasFace(512, 512);
  const center = 256;
  context.fillStyle = '#11171c';
  context.fillRect(0, 0, 512, 512);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 35px system-ui';
  context.fillStyle = '#eeeef0';
  for (let value = 0; value <= SCALE; value += 5) {
    const angle = START + SWEEP * value / SCALE;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const major = value % 20 === 0;
    const radius = major ? 190 : value % 10 === 0 ? 204 : 218;
    context.strokeStyle = major ? '#f2f2ed' : '#8c9ba2';
    context.lineWidth = major ? 7 : 4;
    context.beginPath();
    context.moveTo(center + radius * x, center + radius * y);
    context.lineTo(center + 232 * x, center + 232 * y);
    context.stroke();
    if (major) context.fillText(String(value), center + 158 * x, center + 158 * y);
  }
  context.font = '26px system-ui';
  context.fillText('km/h', center, 399);
  texture.needsUpdate = true;
  group.add(new THREE.Mesh(new THREE.CircleGeometry(0.056, 64),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })));

  const pointer = new THREE.Shape();
  pointer.moveTo(-0.011, -0.0028);
  pointer.lineTo(0.046, -0.0007);
  pointer.lineTo(0.050, 0);
  pointer.lineTo(0.046, 0.0007);
  pointer.lineTo(-0.011, 0.0028);
  pointer.closePath();
  const needle = new THREE.Mesh(new THREE.ShapeGeometry(pointer),
    new THREE.MeshBasicMaterial({ color: '#fe6452', toneMapped: false }));
  needle.position.z = 0.0045;
  group.add(needle);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 8),
    new THREE.MeshStandardMaterial({ color: '#3e4447', roughness: 0.72 }));
  hub.position.z = 0.006;
  hub.scale.z = 0.55;
  group.add(hub);
  return { group, needle };
}

export function createInstruments(grain) {
  const group = new THREE.Group();
  group.position.set(-0.373, 0.526, -0.723);
  group.rotation.x = -0.29;
  const fascia = new THREE.MeshStandardMaterial({ color: '#151a1e', roughness: 0.78 });
  const hoodMaterial = new THREE.MeshStandardMaterial({
    color: '#272c32', roughness: 0.76, bumpMap: grain, bumpScale: 0.0008,
  });
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.343, 0.139, 0.068, 5, 0.024), fascia);
  housing.position.z = 0.011;
  group.add(housing);

  const arch = new THREE.Shape();
  arch.moveTo(-0.186, -0.047);
  arch.bezierCurveTo(-0.181, 0.063, -0.130, 0.094, -0.075, 0.094);
  arch.lineTo(0.078, 0.094);
  arch.bezierCurveTo(0.144, 0.087, 0.173, 0.040, 0.183, -0.043);
  arch.lineTo(0.166, -0.043);
  arch.bezierCurveTo(0.156, 0.033, 0.134, 0.073, 0.078, 0.077);
  arch.lineTo(-0.074, 0.077);
  arch.bezierCurveTo(-0.128, 0.077, -0.159, 0.048, -0.169, -0.047);
  arch.closePath();
  const hood = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, {
    depth: 0.122, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.005, bevelSegments: 2, curveSegments: 16,
  }), hoodMaterial);
  hood.position.z = -0.038;
  group.add(hood);
  const { group: dial, needle } = makeSpeedDial();
  group.add(dial);

  const surround = new THREE.Mesh(new RoundedBoxGeometry(0.117, 0.070, 0.017, 4, 0.007), fascia);
  surround.position.set(0.069, 0, 0.046);
  group.add(surround);
  const { context, texture } = canvasFace(480, 270);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.104, 0.057),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  display.position.set(0.069, 0, 0.055);
  group.add(display);

  let previous;
  function update(vehicle) {
    needle.rotation.z = -(START + SWEEP * Math.min(vehicle.speedKmh, SCALE) / SCALE);
    const speed = Math.round(vehicle.speedKmh);
    const gear = speed === 0 ? 'N' : vehicle.signedSpeed < 0 ? 'R' : 'D';
    const key = `${speed}:${gear}`;
    if (key === previous) return;
    previous = key;
    context.fillStyle = '#182029';
    context.fillRect(0, 0, 480, 270);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#edf2f5';
    context.font = '600 142px system-ui';
    context.fillText(String(speed), 201, 108);
    context.fillStyle = '#b4c1c7';
    context.font = '38px system-ui';
    context.fillText('km/h', 201, 213);
    context.strokeStyle = '#465563';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(350, 47);
    context.lineTo(350, 227);
    context.stroke();
    context.fillStyle = '#eff3f2';
    context.font = 'bold 58px system-ui';
    context.fillText(gear, 411, 134);
    texture.needsUpdate = true;
  }
  return { group, update };
}
