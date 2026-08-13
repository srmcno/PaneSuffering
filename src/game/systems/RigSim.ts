import Phaser from 'phaser';
import { RIG, SIM, TOWER, deckY } from '../config';

export interface DeckLoad {
  /** Distance from deck centre, in deck-local pixels. */
  offset: number;
  mass: number;
}

/**
 * The rig is a hanging platform, and this is its whole physical model: one
 * torsional spring for tilt, one horizontal pendulum for sway, one damped
 * spring for vertical bob, plus a winch.
 *
 * The prototype leaned on Matter.js for this and the cables were never
 * actually simulated, so the deck simply fell. A bespoke model is a few dozen
 * lines, is stable at any frame rate, and is tunable to the feel we want.
 */
export class RigSim {
  /** Tilt in radians; positive means the right-hand end is low. */
  angle = 0;
  angVel = 0;

  /** Horizontal swing about the cable anchors. */
  swayX = 0;
  swayVX = 0;

  /** Deck surface world Y, driven by the winch. */
  y: number;
  targetY: number;

  /** Vertical spring, used for landings and impacts. */
  bobY = 0;
  bobVY = 0;

  winching = false;
  /** Set when the rig slams against the end of its sway travel. */
  clangedThisFrame = false;

  private pendingTorque = 0;
  private pendingImpulse = 0;
  private pendingForce = 0;
  private pendingSwayImpulse = 0;

  constructor(startFloor = 0) {
    this.y = deckY(startFloor);
    this.targetY = this.y;
  }

  /** Continuous torque for this frame (cleared each update). */
  addTorque(t: number): void {
    this.pendingTorque += t;
  }

  /** Instantaneous angular kick, e.g. a body hitting one end of the deck. */
  addImpulse(t: number): void {
    this.pendingImpulse += t;
  }

  /** Continuous lateral force, e.g. wind. */
  addForce(f: number): void {
    this.pendingForce += f;
  }

  addSwayImpulse(f: number): void {
    this.pendingSwayImpulse += f;
  }

  addBob(v: number): void {
    this.bobVY += v;
  }

  get worldX(): number {
    return TOWER.centerX + this.swayX;
  }

  get surfaceY(): number {
    return this.y + this.bobY;
  }

  /**
   * World position of a point rigidly attached to the deck: `offset` runs along
   * the deck from its centre, `lift` runs perpendicular to it, positive upward.
   */
  pointAt(offset: number, lift = 0): Phaser.Math.Vector2 {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return new Phaser.Math.Vector2(
      this.worldX + offset * cos + lift * sin,
      this.surfaceY + offset * sin - lift * cos,
    );
  }

  /** True once the deck has arrived at its winch target. */
  get atTarget(): boolean {
    return Math.abs(this.y - this.targetY) < 0.5;
  }

  setTargetFloor(floor: number): void {
    this.targetY = deckY(floor);
  }

  update(dt: number, loads: readonly DeckLoad[], brace: number, wind: number): void {
    this.clangedThisFrame = false;

    /* ------------------------------------------------------------- tilt */
    let torque = this.pendingTorque;
    const cos = Math.cos(this.angle);
    for (const load of loads) torque += load.offset * load.mass * SIM.loadTorque * cos;
    torque -= SIM.restore * Math.sin(this.angle);
    torque -= SIM.damping * this.angVel;

    if (brace > 0) {
      const authority = Phaser.Math.Clamp(this.angle / SIM.braceMaxAngle, -1, 1);
      torque -= authority * SIM.braceTorque * brace;
      torque -= this.angVel * SIM.braceDamping * brace;
    }

    this.angVel += (torque / SIM.inertia) * dt + this.pendingImpulse / SIM.inertia;
    this.angle += this.angVel * dt;

    // Hard stop: the deck cannot invert, it just hangs off its stirrups.
    const limit = SIM.dumpAngle + 0.42;
    if (Math.abs(this.angle) > limit) {
      this.angle = Math.sign(this.angle) * limit;
      this.angVel *= -0.25;
    }

    /* ------------------------------------------------------------- sway */
    const swayAccel =
      -SIM.swayStiffness * this.swayX - SIM.swayDamping * this.swayVX + wind + this.pendingForce;
    this.swayVX += swayAccel * dt + this.pendingSwayImpulse;
    this.swayX += this.swayVX * dt;
    if (Math.abs(this.swayX) > SIM.swayLimit) {
      if (Math.abs(this.swayVX) > 40) this.clangedThisFrame = true;
      this.swayX = Math.sign(this.swayX) * SIM.swayLimit;
      this.swayVX *= -0.42;
    }

    /* -------------------------------------------------------------- bob */
    this.bobVY += (-58 * this.bobY - 9.5 * this.bobVY) * dt;
    this.bobY += this.bobVY * dt;
    this.bobY = Phaser.Math.Clamp(this.bobY, -26, 26);

    /* ------------------------------------------------------------ winch */
    if (this.winching && !this.atTarget) {
      const step = RIG.winchSpeed * dt;
      this.y =
        this.y > this.targetY
          ? Math.max(this.targetY, this.y - step)
          : Math.min(this.targetY, this.y + step);
      // Hoisting an unevenly loaded deck makes it lurch.
      this.angVel += Math.sin(this.y * 0.02) * 0.0016;
    }

    this.pendingTorque = 0;
    this.pendingImpulse = 0;
    this.pendingForce = 0;
    this.pendingSwayImpulse = 0;
  }

  /**
   * How hard the deck throws a body along its surface, in px/s^2. Zero inside
   * the dead zone so small, constant sway does not make the washer skate.
   */
  slideAccel(slippery: boolean): number {
    const a = this.angle;
    const over = Math.abs(a) - SIM.slideStart;
    if (over <= 0) return 0;
    const scale = slippery ? SIM.slipMultiplier : 1;
    return Math.sign(a) * Math.sin(over) * SIM.slideGravity * scale;
  }
}
