import { MathUtils, Quaternion, Vector3 } from 'three';
import { EMPTY_INPUT, SPAWN, VEHICLE, WHEEL_MOUNTS } from './config.js';

const DOWN = { x: 0, y: -1, z: 0 };
const AXLE = { x: 1, y: 0, z: 0 };
const UP = new Vector3(0, 1, 0);
const ZERO = { x: 0, y: 0, z: 0 };
const IDENTITY = { ...ZERO, w: 1 };

export class Vehicle {
  constructor(RAPIER, world, spawn = { position: SPAWN, rotation: IDENTITY }) {
    this.world = world;
    this.spawnPosition = new Vector3().copy(spawn.position);
    this.spawnRotation = new Quaternion().copy(spawn.rotation);
    this.wheelFilterFlags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setAdditionalMassProperties(VEHICLE.mass, VEHICLE.centerOfMass, VEHICLE.inertia, IDENTITY)
        .setAngularDamping(0.4)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.866, 0.375, 2.08)
        .setTranslation(0, 0.055, 0)
        .setDensity(0)
        .setFriction(0.12)
        .setRestitution(0),
      this.body,
    );
    this.excludeChassis = (collider) => collider.parent()?.handle !== this.body.handle;
    this.previousPosition = new Vector3();
    this.position = new Vector3();
    this.previousRotation = new Quaternion();
    this.rotation = new Quaternion();
    this.forward = new Vector3();
    this.velocity = new Vector3();
    this.reset();
  }

  createWheelController() {
    const controller = this.world.createVehicleController(this.body);
    controller.indexUpAxis = 1;
    controller.setIndexForwardAxis = 2;
    WHEEL_MOUNTS.forEach((mount, i) => {
      controller.addWheel(mount, DOWN, AXLE, VEHICLE.suspensionRestLength, VEHICLE.wheelRadius);
      controller.setWheelMaxSuspensionTravel(i, VEHICLE.suspensionTravel);
      controller.setWheelSuspensionStiffness(i, VEHICLE.suspensionStiffness);
      controller.setWheelSuspensionCompression(i, VEHICLE.compressionDamping);
      controller.setWheelSuspensionRelaxation(i, VEHICLE.reboundDamping);
      controller.setWheelMaxSuspensionForce(i, VEHICLE.maxSuspensionForce);
      controller.setWheelFrictionSlip(i, VEHICLE.frictionSlip);
      controller.setWheelSideFrictionStiffness(i, VEHICLE.lateralGrip);
    });
    return controller;
  }

  get signedSpeed() {
    this.forward.set(0, 0, -1).applyQuaternion(this.body.rotation());
    return this.velocity.copy(this.body.linvel()).dot(this.forward);
  }

  get speedKmh() { return Math.abs(this.signedSpeed) * 3.6; }

  beforeStep(dt, input = EMPTY_INPUT) {
    this.previousPosition.copy(this.position);
    this.previousRotation.copy(this.rotation);
    const speed = this.signedSpeed;
    const speedAbs = Math.abs(speed);
    const steeringLimit = VEHICLE.steeringAngle / (1 + speedAbs * 0.055 + speedAbs ** 2 * 0.0035);
    this.steering = MathUtils.damp(this.steering, input.steer * steeringLimit, 8, dt);
    this.braking = input.brake || (input.reverse && speed > 0.35)
      || (input.throttle && speed < -0.35);
    this.body.applyImpulse(this.velocity.multiplyScalar(-VEHICLE.airDragFactor * this.velocity.length() * dt), true);

    let drive = 0;
    // El regulador reduce el par cerca del límite y deja a Rapier resolver la inercia.
    if (!this.braking) {
      if (input.throttle && !input.reverse) {
        const availableForce = Math.min(VEHICLE.engineForce, VEHICLE.wheelPower / Math.max(speed, 1));
        drive = availableForce * MathUtils.clamp((VEHICLE.maxForwardSpeed - speed) / VEHICLE.speedGovernorTaper, 0, 1);
      } else if (input.reverse && !input.throttle) {
        drive = -VEHICLE.reverseForce * MathUtils.clamp((VEHICLE.maxReverseSpeed + speed) / VEHICLE.speedGovernorTaper, 0, 1);
      }
    }

    const steerTan = Math.tan(this.steering);
    WHEEL_MOUNTS.forEach((mount, i) => {
      const front = mount.z < 0;
      // La rueda interior gira más para que ambas sigan el mismo centro de giro.
      const angle = Math.atan(steerTan / (1 + mount.x * steerTan / VEHICLE.wheelbase));
      const brakeShare = front ? VEHICLE.frontBrakeBias : 1 - VEHICLE.frontBrakeBias;
      const brake = this.braking ? VEHICLE.brakeForce * brakeShare / 2 : VEHICLE.rollingResistance / 4;
      this.controller.setWheelSteering(i, front ? angle : 0);
      this.controller.setWheelEngineForce(i, front ? drive / 2 : 0);
      // Rapier recibe un impulso máximo de frenado (N·s), no una fuerza.
      this.controller.setWheelBrake(i, brake * dt);
    });
    this.controller.updateVehicle(dt, this.wheelFilterFlags, undefined, this.excludeChassis);
  }

  afterStep() {
    this.previousWheelPose = this.wheelPose;
    this.wheelPose = WHEEL_MOUNTS.map((mount, i) => ({
      y: mount.y - this.controller.wheelSuspensionLength(i),
      steering: this.controller.wheelSteering(i),
      spin: -this.controller.wheelRotation(i),
    }));
    this.position.copy(this.body.translation());
    this.rotation.copy(this.body.rotation());
    if (this.position.y < -8 || !Number.isFinite(this.position.lengthSq())) this.reset();
  }

  syncVisual(group, alpha) {
    group.position.lerpVectors(this.previousPosition, this.position, alpha);
    group.quaternion.slerpQuaternions(this.previousRotation, this.rotation, alpha);
  }

  wheelTelemetry() {
    return this.wheelPose.map(({ y, steering }, i) => {
      const contact = this.controller.wheelIsInContact(i);
      let lateralSpeed = null;
      if (contact) {
        const normal = this.controller.wheelContactNormal(i, new Vector3());
        const point = this.controller.wheelContactPoint(i);
        const alongAxle = new Vector3(1, 0, 0)
          .applyAxisAngle(UP, steering).applyQuaternion(this.rotation)
          .projectOnPlane(normal).normalize();
        const velocity = new Vector3().copy(this.body.velocityAtPoint(point));
        const ground = this.controller.wheelGroundObject(i)?.parent();
        if (ground) velocity.sub(ground.velocityAtPoint(point));
        lateralSpeed = velocity.dot(alongAxle);
      }
      return {
        contact,
        suspensionLength: WHEEL_MOUNTS[i].y - y,
        load: Math.min(this.controller.wheelSuspensionForce(i), VEHICLE.maxSuspensionForce),
        lateralSpeed,
      };
    });
  }

  reset() {
    this.body.setTranslation(this.spawnPosition, true);
    this.body.setRotation(this.spawnRotation, true);
    this.body.setLinvel(ZERO, true);
    this.body.setAngvel(ZERO, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    if (this.controller) this.world.removeVehicleController(this.controller);
    this.controller = this.createWheelController();
    this.wheelPose = WHEEL_MOUNTS.map(({ y }) => ({
      y: y - VEHICLE.suspensionRestLength,
      steering: 0,
      spin: 0,
    }));
    this.previousWheelPose = this.wheelPose;
    this.position.copy(this.spawnPosition);
    this.previousPosition.copy(this.spawnPosition);
    this.rotation.copy(this.spawnRotation);
    this.previousRotation.copy(this.spawnRotation);
    this.steering = 0;
    this.braking = false;
  }
}
