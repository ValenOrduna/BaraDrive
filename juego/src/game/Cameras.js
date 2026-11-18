import * as THREE from 'three';

// Ojo del conductor en el marco del auto (m). La cabina fija el campo horizontal
// para que el pilar A quede fuera del 20 % izquierdo en cualquier proporción.
export const DRIVER_EYE = { x: -0.205, y: 0.829, z: -0.126 };
export const DRIVER_TARGET = { x: DRIVER_EYE.x, y: -2.45, z: -20 };
export const FIELD_OF_VIEW = { exterior: 65, interiorHorizontal: 85 };
// Cámara de persecución centrada detrás del auto, en su marco (m).
export const CHASE_EYE = { x: 0, y: 2.05, z: 5.9 };
export const CHASE_TARGET = { x: 0, y: 0.8, z: -3.2 };

export function interiorFov(aspect) {
  const half = THREE.MathUtils.degToRad(FIELD_OF_VIEW.interiorHorizontal / 2);
  const vertical = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / aspect));
  return THREE.MathUtils.clamp(vertical, 35, 80);
}

export class Cameras {
  constructor(camera, car, obstacles) {
    this.camera = camera;
    this.car = car;
    this.obstacles = obstacles;
    this.mode = 'exterior';
    this.snap = true;
    this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.hits = [];
  }

  toggle() {
    this.mode = this.mode === 'exterior' ? 'interior' : 'exterior';
    this.snap = true;
    return this.mode;
  }

  update(dt, state, elapsed) {
    this.car.updateMatrixWorld(true);
    const fov = state !== 'menu' && this.mode === 'interior'
      ? interiorFov(this.camera.aspect) : FIELD_OF_VIEW.exterior;
    if (Math.abs(this.camera.fov - fov) > 1e-6) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    if (state === 'menu') {
      this.desired.set(-7.5 + Math.sin(elapsed * 0.12) * 0.9, 4.2, -7.3);
      this.car.localToWorld(this.desired);
      this.target.copy(this.car.position);
      this.target.y += 0.5;
      this.camera.position.copy(this.desired);
      this.camera.lookAt(this.target);
      this.snap = true;
      return;
    }
    if (this.mode === 'interior') {
      this.desired.copy(DRIVER_EYE);
      this.target.copy(DRIVER_TARGET);
      this.car.localToWorld(this.desired);
      this.car.localToWorld(this.target);
      this.camera.position.copy(this.desired);
      this.camera.lookAt(this.target);
    } else {
      this.desired.copy(CHASE_EYE);
      this.target.copy(CHASE_TARGET);
      this.car.localToWorld(this.desired);
      this.car.localToWorld(this.target);
      this.rayOrigin.copy(this.car.position);
      this.rayOrigin.y += 1;
      this.avoidWalls(this.desired);
      if (this.snap) this.camera.position.copy(this.desired);
      else this.camera.position.lerp(this.desired, 1 - Math.exp(-7 * dt));
      this.avoidWalls(this.camera.position);
      this.camera.lookAt(this.target);
    }
    this.snap = false;
  }

  avoidWalls(position) {
    this.rayDirection.subVectors(position, this.rayOrigin);
    const distance = this.rayDirection.length();
    if (distance < 0.01) return;
    this.rayDirection.normalize();
    this.raycaster.set(this.rayOrigin, this.rayDirection);
    this.raycaster.far = distance;
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.obstacles, false, this.hits);
    if (this.hits.length) position.copy(this.rayOrigin).addScaledVector(this.rayDirection, Math.max(0.2, this.hits[0].distance - 0.3));
  }
}
