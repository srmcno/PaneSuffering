import Phaser from 'phaser';

/**
 * Fixed design resolution. Everything is authored against this and letterboxed
 * by Phaser.Scale.FIT, which keeps HUD layout, hit-boxes and tuning stable on
 * every display instead of drifting with window size.
 */
export const VIEW = { W: 1280, H: 720 } as const;

/* ------------------------------------------------------------------ world */

/** Horizontal extent of the tower face, in world units. */
export const TOWER = {
  left: 205,
  right: 1075,
  get width(): number {
    return this.right - this.left;
  },
  get centerX(): number {
    return (this.left + this.right) / 2;
  },
} as const;

export const FLOOR_COUNT = 8;
export const FLOOR_HEIGHT = 330;
export const FLOOR0_Y = 0;

/** World Y of the window band for a given floor (0 = lowest, ascending). */
export const floorY = (floor: number): number => FLOOR0_Y - floor * FLOOR_HEIGHT;

/**
 * World Y of the rig deck's walking surface for a given floor. Parked 100px
 * below the pane centre, which puts the glass between chest height and the
 * top of a pole-extended squeegee's reach.
 */
export const deckY = (floor: number): number => floorY(floor) + 100;

export const ROOF_Y = floorY(FLOOR_COUNT - 1) - 250;
export const STREET_Y = FLOOR0_Y + 1560;

/* ---------------------------------------------------------------- windows */

export const PANE = {
  width: 180,
  height: 150,
  gap: 24,
  perFloor: 4,
} as const;

/** World X of the centre of pane `col` on any floor. */
export const paneX = (col: number): number => {
  const span = PANE.perFloor * PANE.width + (PANE.perFloor - 1) * PANE.gap;
  return TOWER.centerX - span / 2 + PANE.width / 2 + col * (PANE.width + PANE.gap);
};

/* -------------------------------------------------------------------- rig */

export const RIG = {
  /** Full deck length. */
  length: 850,
  deckThickness: 18,
  /** How far from deck centre the washer may walk before the rails stop them. */
  walkLimit: 388,
  /** Cable attachment offset from deck centre. */
  cableOffset: 408,
  /** Deck-local X of the water bucket; the soap refill zone keys off this. */
  bucketOffset: -182,
  /** Guard rail posts. */
  railOffset: 418,
  railHeight: 74,
  winchSpeed: 104,
} as const;

/* ------------------------------------------------------------ simulation */

export const SIM = {
  /** Moment of inertia of the deck. Lower = twitchier. */
  inertia: 28,
  /** Cable restoring stiffness (torque per radian, roughly). */
  restore: 62,
  /** Angular damping. Tuned to ~0.38 critical: it sloshes, then settles. */
  damping: 32,
  /** Torque per unit of (mass * offset) from a load standing on the deck. */
  loadTorque: 0.036,
  /** Counter-torque applied while crouched and braced. */
  braceTorque: 34,
  /** Extra angular damping while braced. */
  braceDamping: 44,
  /** Max brace authority, so bracing is a tool and not an autopilot. */
  braceMaxAngle: 0.34,

  /** Horizontal pendulum sway. */
  swayStiffness: 7.2,
  swayDamping: 2.15,
  swayLimit: 34,

  /** Angle (rad) at which the washer starts sliding. */
  slideStart: 0.1,
  /** Angle (rad) at which footing is lost entirely. */
  dumpAngle: 0.55,
  /** Slide acceleration multiplier (px/s^2 per rad, roughly gravity). */
  slideGravity: 1150,
  /** Extra slip when the deck is soapy/soiled. */
  slipMultiplier: 2.35,
} as const;

export const WASHER = {
  mass: 1,
  walkAccel: 3200,
  walkMax: 236,
  /** Walking while working the squeegee is deliberately slow. */
  cleanSpeedScale: 0.5,
  friction: 12,
  height: 92,
} as const;

export const SQUEEGEE = {
  /** Vertical extent of the pole sweep, relative to the deck surface. */
  low: -22,
  high: -184,
  /** Seconds for one full up-and-down stroke. */
  strokePeriod: 1.05,
  /** Three sample points across the blade, each with this radius. */
  bladeHalfWidth: 17,
  sampleRadius: 21,
  /** Scrub power per second with a wet blade. One slow pass nearly clears. */
  power: 9.2,
} as const;

/* ----------------------------------------------------------------- combat */

export const RULES = {
  maxHealth: 100,
  safetyLineCooldown: 8,
  safetyLineInvuln: 0.9,
  /** Seconds of hanging-on before the washer falls. */
  grabWindow: 2.2,
  /** Taps needed to haul back onto the deck. */
  grabTaps: 6,
  /** Average pane cleanliness needed to unlock the winch. */
  floorTarget: 0.9,
  /** About two and a half panes of continuous work per bucket. */
  soapCapacity: 14,
  soapDrain: 1,
  soapRefill: 5.5,
  /** Cleaning power without soap. */
  drySqueegeeScale: 0.3,
} as const;

/* ----------------------------------------------------------------- depths */

export const DEPTH = {
  sky: -1000,
  stars: -960,
  skylineFar: -940,
  skylineMid: -920,
  cloudFar: -900,
  skylineNear: -880,
  street: -860,
  facade: -800,
  paneGlass: -760,
  paneGrime: -740,
  facadeTrim: -700,
  cable: -100,
  hazardBack: -60,
  deck: 0,
  washer: 40,
  rigFront: 60,
  hazard: 100,
  particles: 140,
  cloudNear: 200,
  overlay: 400,
} as const;

/* ---------------------------------------------------------------- palette */

export const PALETTE = {
  concrete: 0x2f3545,
  concreteLight: 0x424a5e,
  concreteDark: 0x1e2431,
  mullion: 0x596174,
  glass: 0x14243a,
  glassLight: 0x24405f,
  steel: 0x8792a6,
  steelDark: 0x515a6b,
  hiVis: 0xd9f24e,
  hiVisDark: 0x9cb32f,
  skin: 0xe8b48c,
  helmet: 0xf2f4f7,
  amber: 0xf6b73c,
  danger: 0xff5a4d,
  good: 0x5ce8a0,
  ink: 0x080b12,
  paper: 0xeaf0fb,
} as const;

export const CSS = {
  amber: '#f6b73c',
  danger: '#ff5a4d',
  good: '#5ce8a0',
  paper: '#eaf0fb',
  dim: '#8e9bb3',
  ink: '#080b12',
} as const;

export const FONT = 'Inter, "Segoe UI", Roboto, system-ui, sans-serif';

/* --------------------------------------------------------------- controls */

export const Controls = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  crouch: ['S', 'DOWN'],
  winch: ['W', 'UP'],
  clean: ['SPACE'],
  safety: ['SHIFT'],
  pause: ['ESC', 'P'],
  mute: ['M'],
} as const;

export const ALL_KEYS: string[] = Object.values(Controls).flatMap((k) => [...k]);

/* ----------------------------------------------------------------- phaser */

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: VIEW.W,
  height: VIEW.H,
  backgroundColor: '#070a12',
  antialias: true,
  roundPixels: false,
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: { target: 60, min: 30 },
};
