import Phaser from 'phaser';
import { Washer } from '../entities/Washer';
import { Fx } from '../systems/Fx';
import { RigSim } from '../systems/RigSim';
import { Tower } from '../world/Tower';

/** Everything a hazard is allowed to reach for. */
export interface HazardContext {
  scene: Phaser.Scene;
  sim: RigSim;
  washer: Washer;
  tower: Tower;
  fx: Fx;
  /** Current floor the rig is working. */
  floor: number;
  /** Report a landed hit; the scene owns damage, scoring and feedback. */
  hit(damage: number, knock: number, source: string): void;
  /** Report a dodged hazard that passed close enough to be worth points. */
  closeShave(x: number, y: number): void;
}

export interface Hazard {
  alive: boolean;
  /** Load this hazard puts on the deck, if any (offset is deck-local). */
  readonly load?: { offset: number; mass: number };
  update(dt: number, ctx: HazardContext): void;
  destroy(): void;
}
