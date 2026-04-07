import Phaser from 'phaser';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const PHYSICS = {
  gravityY: 1.2,
  rigStiffness: 0.002,
  rigDamping: 0.02,
  maxRigAngleForFailure: Phaser.Math.DegToRad(42),
  criticalInstabilityMs: 3500,
};

export const PLAYER = {
  moveForce: 0.0035,
  maxSpeed: 6,
  leanTorque: 0.00045,
  healthMax: 100,
  duckScaleY: 0.65,
  anchorCooldownMs: 7000,
  anchorDurationMs: 1800,
  anchorStabilityBoost: 0.35,
};

export const CLEANING = {
  quota: 9,
  holdDurationMs: 650,
  range: 86,
};

export const HAZARDS = {
  pigeonInterval: [4000, 7000] as [number, number],
  poopInterval: [5500, 8500] as [number, number],
  windInterval: [7000, 11000] as [number, number],
  windowInterval: [6500, 10500] as [number, number],
  debrisInterval: [5000, 9000] as [number, number],
  setPieceAtMs: 65000,
  levelLengthMs: 115000,
};

export const INPUT_BINDINGS = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  leanLeft: ['Q'],
  leanRight: ['E'],
  clean: ['SPACE'],
  duck: ['S', 'CTRL'],
  anchor: ['SHIFT'],
  pause: ['ESC'],
};

export const COLORS = {
  bgTop: 0x1b2238,
  bgBottom: 0x0c101d,
  building: 0x2c3654,
  rig: 0xe7d9a5,
  rope: 0xb9bcc6,
  dirtyWindow: 0x556b85,
  cleanWindow: 0x9ecdf4,
};
