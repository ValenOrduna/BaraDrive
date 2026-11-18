// Metros, segundos, kilogramos. Three/Rapier: Y arriba, frente del auto -Z.
export const FIXED_STEP = 1 / 60;
export const SPAWN = { x: -40, y: 0.49, z: 40 };
export const VEHICLE = Object.freeze({
  mass: 1150,
  centerOfMass: { x: 0, y: 0.04, z: -0.23 },
  inertia: { x: 1450, y: 1600, z: 300 },
  wheelbase: 2.551,
  trackWidth: 1.50,
  wheelRadius: 0.31,
  tireWidth: 0.185,
  suspensionMountY: 0.10,
  suspensionRestLength: 0.34,
  suspensionTravel: 0.14,
  suspensionStiffness: 36,
  compressionDamping: 3.4,
  reboundDamping: 4.4,
  maxSuspensionForce: 9000,
  frictionSlip: 0.92,
  lateralGrip: 0.8,
  engineForce: 4600,
  wheelPower: 48000,
  reverseForce: 3000,
  brakeForce: 9400,
  frontBrakeBias: 0.66,
  rollingResistance: 110,
  airDragFactor: 0.38,
  maxForwardSpeed: 60 / 3.6,
  maxReverseSpeed: 15 / 3.6,
  speedGovernorTaper: 0.55,
  steeringAngle: 0.50,
});

export const WHEEL_MOUNTS = [-1, 1].flatMap((axle) => [-1, 1].map((side) => ({
  name: `wheel_${axle < 0 ? 'front' : 'rear'}_${side < 0 ? 'left' : 'right'}`,
  x: side * VEHICLE.trackWidth / 2,
  y: VEHICLE.suspensionMountY,
  z: axle * VEHICLE.wheelbase / 2,
})));

export const EMPTY_INPUT = Object.freeze({ throttle: false, reverse: false, brake: false, steer: 0 });
