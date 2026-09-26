import type { PerkId } from '../systems/Perks';

export interface InputIntent {
  /** -1 left, 0 none, 1 right. */
  move: -1 | 0 | 1;
  crouchHeld: boolean;
  cleanHeld: boolean;
  winchHeld: boolean;
  safetyPressed: boolean;
  pausePressed: boolean;
  mutePressed: boolean;
  /** Rising edge of any "confirm" input, used by the grab QTE. */
  anyTapped: boolean;
}

export interface HudState {
  score: number;
  multiplier: number;
  health: number;
  maxHealth: number;
  floor: number;
  floorCount: number;
  floorProgress: number;
  soap: number;
  soapCapacity: number;
  tilt: number;
  dumpAngle: number;
  safetyCooldown: number;
  safetyCooldownMax: number;
  winchReady: boolean;
  wind: number;
  elapsed: number;
  /** Touch pads are driving the run, so prompts must not name keys. */
  touch: boolean;
  /** Upgrades owned this run, in pick order. */
  perks: Array<{ id: PerkId; stacks: number }>;
}

export type ToastTone = 'info' | 'warn' | 'good';

export interface RunSummary {
  win: boolean;
  score: number;
  bestScore: number;
  newBest: boolean;
  floorsCleared: number;
  floorCount: number;
  panesCleaned: number;
  spotless: number;
  bestMultiplier: number;
  timeSeconds: number;
  reason: string;
  /** Upgrades signed for during the run. */
  perks?: Array<{ id: PerkId; stacks: number }>;
}
