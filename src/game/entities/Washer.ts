import Phaser from 'phaser';
import { DEPTH, RIG, RULES, SIM, SQUEEGEE, WASHER } from '../config';
import { InputIntent } from '../types/GameTypes';
import { RigSim } from '../systems/RigSim';

export type WasherState = 'stand' | 'walk' | 'crouch' | 'clean' | 'stagger' | 'hang' | 'fall';

export interface WasherContext {
  slippery: boolean;
  canClean: boolean;
  frozen: boolean;
}

const INK = 0x0a0e16;

/**
 * The window washer. Drawn from scratch every frame as a jointed figure so the
 * pose can carry state — bracing, straining against the tilt, sweeping a pole
 * squeegee, or dangling off the low rail by their fingertips.
 */
export class Washer {
  state: WasherState = 'stand';
  localX = 0;
  vx = 0;
  facing: -1 | 1 = 1;
  health: number = RULES.maxHealth;
  invuln = 0;
  stagger = 0;

  /** Deck-local X and lift of the squeegee blade. */
  bladeX = 0;
  bladeLift = 120;

  /** Hanging QTE. */
  hangSide: -1 | 1 = 1;
  hangTimer = 0;
  hangTaps = 0;

  /** Free-fall bookkeeping, driven once the deck lets go. */
  fallX = 0;
  fallY = 0;
  fallVX = 0;
  fallVY = 0;
  fallSpin = 0;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private strokePhase = 0;
  private walkPhase = 0;
  private breathe = 0;
  private flash = 0;
  private crouchAmount = 0;
  private cleaning = false;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.washer);
  }

  get isCleaning(): boolean {
    return this.cleaning;
  }

  get isCrouched(): boolean {
    return this.crouchAmount > 0.5;
  }

  get isDown(): boolean {
    return this.state === 'hang' || this.state === 'fall';
  }

  /** Mass the deck feels, and where. Hanging off the rail pulls much harder. */
  get load(): { offset: number; mass: number } {
    if (this.state === 'fall') return { offset: 0, mass: 0 };
    if (this.state === 'hang') return { offset: this.hangSide * RIG.railOffset, mass: WASHER.mass * 1.15 };
    return { offset: this.localX, mass: WASHER.mass };
  }

  /** 0..1 brace authority handed to the rig sim. */
  get brace(): number {
    return this.state === 'crouch' ? this.crouchAmount : 0;
  }

  update(dt: number, sim: RigSim, intent: InputIntent, ctx: WasherContext): void {
    this.invuln = Math.max(0, this.invuln - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.breathe += dt;

    if (this.state === 'fall') {
      this.updateFall(dt);
      this.drawFalling();
      return;
    }
    if (this.state === 'hang') {
      this.updateHang(dt, sim, intent);
      this.draw(sim);
      return;
    }

    const controllable = !ctx.frozen && this.stagger <= 0;
    const wantsCrouch = controllable && intent.crouchHeld;
    this.crouchAmount = Phaser.Math.Linear(this.crouchAmount, wantsCrouch ? 1 : 0, Math.min(1, dt * 14));

    this.cleaning = controllable && intent.cleanHeld && !wantsCrouch && ctx.canClean;

    /* ------------------------------------------------------------ motion */
    const moveInput = controllable && !wantsCrouch ? intent.move : 0;
    if (moveInput !== 0) this.facing = moveInput as -1 | 1;

    const speedScale = this.cleaning ? WASHER.cleanSpeedScale : 1;
    const accel = moveInput * WASHER.walkAccel * speedScale;
    const slide = sim.slideAccel(ctx.slippery) * (wantsCrouch ? 0.18 : 1);
    this.vx += (accel + slide) * dt;

    const friction = WASHER.friction * (wantsCrouch ? 3.1 : moveInput === 0 ? 1.4 : 1);
    this.vx -= this.vx * Math.min(1, friction * dt);
    this.vx = Phaser.Math.Clamp(this.vx, -WASHER.walkMax * 1.9, WASHER.walkMax * 1.9);
    if (moveInput !== 0 && Math.abs(this.vx) > WASHER.walkMax * speedScale && Math.sign(this.vx) === moveInput) {
      this.vx = moveInput * WASHER.walkMax * speedScale;
    }

    this.localX += this.vx * dt;
    if (Math.abs(this.localX) > RIG.walkLimit) {
      this.localX = Math.sign(this.localX) * RIG.walkLimit;
      this.vx *= -0.15;
    }

    /* ------------------------------------------------------- lose footing */
    const dumpAt = SIM.dumpAngle + this.crouchAmount * 0.13;
    if (Math.abs(sim.angle) > dumpAt) {
      this.beginHang(Math.sign(sim.angle) as -1 | 1);
      this.draw(sim);
      return;
    }

    /* -------------------------------------------------------- squeegee */
    if (this.cleaning) {
      this.strokePhase += dt / SQUEEGEE.strokePeriod;
    } else {
      this.strokePhase += dt * 0.25;
    }
    const s = 0.5 - 0.5 * Math.cos(this.strokePhase * Math.PI * 2);
    this.bladeLift = this.cleaning
      ? -Phaser.Math.Linear(SQUEEGEE.low, SQUEEGEE.high, s)
      : 96;
    this.bladeX = this.localX + this.facing * 5 + (this.cleaning ? Math.sin(this.strokePhase * Math.PI * 4) * 9 : 0);

    /* ----------------------------------------------------------- state */
    this.walkPhase += Math.abs(this.vx) * dt * 0.05;
    if (this.stagger > 0) this.state = 'stagger';
    else if (wantsCrouch) this.state = 'crouch';
    else if (this.cleaning) this.state = 'clean';
    else if (Math.abs(this.vx) > 22) this.state = 'walk';
    else this.state = 'stand';

    this.draw(sim);
  }

  /** Take damage. Returns true if it actually landed. */
  hurt(amount: number, knock = 0): boolean {
    if (this.invuln > 0 || this.state === 'fall') return false;
    this.health = Math.max(0, this.health - amount);
    this.invuln = 0.55;
    this.stagger = 0.42;
    this.flash = 1;
    this.vx += knock;
    return true;
  }

  grantInvulnerability(seconds: number): void {
    this.invuln = Math.max(this.invuln, seconds);
  }

  /** Called when the safety line is fired: hauls the washer back upright. */
  recover(): void {
    if (this.state === 'hang') {
      this.state = 'stagger';
      this.stagger = 0.3;
      this.localX = this.hangSide * (RIG.walkLimit - 40);
      this.vx = 0;
    }
  }

  beginFall(sim: RigSim): void {
    const p = sim.pointAt(this.localX, 0);
    this.state = 'fall';
    this.fallX = p.x;
    this.fallY = p.y;
    this.fallVX = this.vx * 0.4;
    this.fallVY = -40;
    this.fallSpin = Phaser.Math.FloatBetween(-2.4, 2.4);
  }

  destroy(): void {
    this.gfx.destroy();
  }

  /* ---------------------------------------------------------------- states */

  private beginHang(side: -1 | 1): void {
    if (this.state === 'hang') return;
    this.state = 'hang';
    this.hangSide = side;
    this.hangTimer = RULES.grabWindow;
    this.hangTaps = 0;
    this.cleaning = false;
    this.vx = 0;
    this.localX = side * RIG.walkLimit;
  }

  private updateHang(dt: number, sim: RigSim, intent: InputIntent): void {
    this.hangTimer -= dt;
    if (intent.anyTapped) this.hangTaps++;

    // Recovering needs the taps and a deck that is no longer actively dumping.
    if (this.hangTaps >= RULES.grabTaps && Math.abs(sim.angle) < SIM.dumpAngle) {
      this.state = 'stagger';
      this.stagger = 0.35;
      this.localX = this.hangSide * (RIG.walkLimit - 46);
      this.vx = -this.hangSide * 40;
      return;
    }
    if (this.hangTimer <= 0) this.beginFall(sim);
  }

  private updateFall(dt: number): void {
    this.fallVY += 1500 * dt;
    this.fallX += this.fallVX * dt;
    this.fallY += this.fallVY * dt;
    this.fallSpin += dt * 2.2;
  }

  /* --------------------------------------------------------------- drawing */

  private tint(base: number): number {
    if (this.flash <= 0) return base;
    const c = Phaser.Display.Color.IntegerToColor(base);
    const t = Math.min(1, this.flash);
    return Phaser.Display.Color.GetColor(
      Math.round(Phaser.Math.Linear(c.red, 255, t)),
      Math.round(Phaser.Math.Linear(c.green, 235, t)),
      Math.round(Phaser.Math.Linear(c.blue, 235, t)),
    );
  }

  /** Thick dark line then a thinner coloured line: cheap, readable outlines. */
  private limb(g: Phaser.GameObjects.Graphics, pts: number[][], width: number, color: number): void {
    for (const [w, c] of [
      [width + 4, INK],
      [width, this.tint(color)],
    ] as Array<[number, number]>) {
      g.lineStyle(w, c, 1);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.strokePath();
    }
  }

  private draw(sim: RigSim): void {
    const g = this.gfx;
    g.clear();

    if (this.invuln > 0 && this.state !== 'hang' && Math.floor(this.invuln * 22) % 2 === 0) {
      g.setAlpha(0.45);
    } else {
      g.setAlpha(1);
    }

    if (this.state === 'hang') {
      this.drawHanging(sim);
      return;
    }

    const foot = sim.pointAt(this.localX, 0);
    g.setPosition(foot.x, foot.y).setRotation(sim.angle);

    const crouch = this.crouchAmount;
    const scaleY = 1 - crouch * 0.34;
    const bob = Math.sin(this.breathe * 2.1) * 1.4 + Math.abs(Math.sin(this.walkPhase)) * -3;
    // Fight to stay vertical: the body counter-rotates against the deck.
    const counter = -sim.angle * (0.55 + crouch * 0.35);

    const hipY = (-48 + bob) * scaleY;
    const shoulderY = (-72 + bob) * scaleY;
    const headY = (-86 + bob) * scaleY;

    this.drawLegs(g, hipY, scaleY, crouch);

    g.save();
    g.translateCanvas(0, hipY);
    g.rotateCanvas(counter);
    g.translateCanvas(0, -hipY);
    this.drawTorso(g, hipY, shoulderY, headY, crouch);
    this.drawArmsAndPole(g, shoulderY, hipY);
    g.restore();
  }

  private drawLegs(g: Phaser.GameObjects.Graphics, hipY: number, scaleY: number, crouch: number): void {
    const swing = this.state === 'walk' ? Math.sin(this.walkPhase) * 15 : 0;
    const stance = 7 + crouch * 12;
    const kneeDrop = crouch * 9;

    for (const [side, phase] of [
      [-1, swing],
      [1, -swing],
    ] as Array<[number, number]>) {
      const footX = side * stance + phase;
      const kneeX = side * (stance * 0.6) + phase * 0.45 + crouch * side * 6;
      const kneeY = hipY * 0.45 + kneeDrop;
      this.limb(
        g,
        [
          [0, hipY],
          [kneeX, kneeY],
          [footX, -2 * scaleY],
        ],
        9,
        0x2f3a52,
      );
      // Boot.
      g.fillStyle(INK, 1);
      g.fillRect(footX - 9, -6, 19, 7);
      g.fillStyle(this.tint(0x3b3128), 1);
      g.fillRect(footX - 8, -7, 17, 5);
    }
  }

  private drawTorso(
    g: Phaser.GameObjects.Graphics,
    hipY: number,
    shoulderY: number,
    headY: number,
    crouch: number,
  ): void {
    const lean = this.facing * (2 + crouch * 5);

    // Coveralls.
    g.fillStyle(INK, 1);
    g.fillRoundedRect(-14, shoulderY - 4, 28, hipY - shoulderY + 12, 7);
    g.fillStyle(this.tint(0x33405c), 1);
    g.fillRoundedRect(-12, shoulderY - 2, 24, hipY - shoulderY + 9, 6);

    // Hi-vis vest with reflective banding.
    g.fillStyle(this.tint(0xd9f24e), 1);
    g.fillRoundedRect(-12, shoulderY + 2, 24, (hipY - shoulderY) * 0.7, 5);
    g.fillStyle(this.tint(0xf4f7ff), 0.9);
    g.fillRect(-12, shoulderY + 12, 24, 3.5);
    g.fillRect(-12, shoulderY + 24, 24, 3.5);
    g.fillStyle(this.tint(0x9cb32f), 1);
    g.fillRect(-2, shoulderY + 2, 3, (hipY - shoulderY) * 0.7);

    // Harness strap and the safety lanyard's D-ring.
    g.lineStyle(3, INK, 0.85);
    g.lineBetween(-11, shoulderY + 6, 9, hipY - 4);
    g.fillStyle(this.tint(0x8792a6), 1);
    g.fillCircle(9, hipY - 4, 3.4);

    // Head.
    g.fillStyle(INK, 1);
    g.fillCircle(lean, headY, 10.5);
    g.fillStyle(this.tint(0xe8b48c), 1);
    g.fillCircle(lean, headY, 9);
    g.fillStyle(this.tint(0x0d1220), 1);
    g.fillCircle(lean + this.facing * 4, headY - 1, 1.7);

    // Hard hat.
    g.fillStyle(INK, 1);
    g.slice(lean, headY - 1, 12.5, Math.PI, Math.PI * 2, false);
    g.fillPath();
    g.fillStyle(this.tint(0xf2f4f7), 1);
    g.slice(lean, headY - 2, 11, Math.PI, Math.PI * 2, false);
    g.fillPath();
    g.fillStyle(INK, 1);
    g.fillRect(lean - 13, headY - 3, 26, 3.5);
    g.fillStyle(this.tint(0xdfe4ec), 1);
    g.fillRect(lean + this.facing * 2 - 13, headY - 3, 24, 2.6);
  }

  private drawArmsAndPole(g: Phaser.GameObjects.Graphics, shoulderY: number, hipY: number): void {
    const f = this.facing;
    const reaching = this.state === 'clean';

    // Where the blade sits relative to the body.
    const bladeLocalX = (this.bladeX - this.localX) * 1;
    const bladeLocalY = -this.bladeLift;

    const gripLow = reaching ? [f * 9, hipY - 12] : [f * 13, hipY - 6];
    const gripHigh = reaching ? [f * 12, shoulderY + 6] : [f * 15, shoulderY + 2];

    if (reaching) {
      // Pole from the low grip out to the blade.
      const dx = bladeLocalX - gripLow[0];
      const dy = bladeLocalY - gripLow[1];
      const len = Math.hypot(dx, dy) || 1;
      const backX = gripLow[0] - (dx / len) * 22;
      const backY = gripLow[1] - (dy / len) * 22;

      this.limb(g, [[backX, backY], [bladeLocalX, bladeLocalY]], 5, 0x9aa5ba);

      // Blade head: yellow channel plus black rubber.
      g.save();
      g.translateCanvas(bladeLocalX, bladeLocalY);
      g.rotateCanvas(Math.atan2(dy, dx) + Math.PI / 2);
      g.fillStyle(INK, 1);
      g.fillRect(-SQUEEGEE.bladeHalfWidth - 3, -6, SQUEEGEE.bladeHalfWidth * 2 + 6, 12);
      g.fillStyle(this.tint(0xf6b73c), 1);
      g.fillRect(-SQUEEGEE.bladeHalfWidth, -4, SQUEEGEE.bladeHalfWidth * 2, 6);
      g.fillStyle(this.tint(0x14181f), 1);
      g.fillRect(-SQUEEGEE.bladeHalfWidth, 1, SQUEEGEE.bladeHalfWidth * 2, 4);
      g.restore();

      this.limb(g, [[f * 10, shoulderY + 4], [f * 20, shoulderY + 20], gripHigh as number[]], 7, 0xd9f24e);
      this.limb(g, [[-f * 8, shoulderY + 6], [f * 2, hipY - 18], gripLow as number[]], 7, 0x33405c);
    } else {
      // Squeegee shouldered when idle.
      const restX = -f * 16;
      const restY = shoulderY - 34;
      this.limb(g, [[f * 6, hipY - 4], [restX, restY]], 5, 0x9aa5ba);
      g.save();
      g.translateCanvas(restX, restY);
      g.rotateCanvas(Math.atan2(restY - (hipY - 4), restX - f * 6) + Math.PI / 2);
      g.fillStyle(INK, 1);
      g.fillRect(-15, -5, 30, 10);
      g.fillStyle(this.tint(0xf6b73c), 1);
      g.fillRect(-13, -3, 26, 5);
      g.restore();

      const swing = this.state === 'walk' ? Math.sin(this.walkPhase) * 9 : 0;
      this.limb(g, [[f * 9, shoulderY + 4], [f * 14 + swing, shoulderY + 22], [f * 8, hipY - 4]], 7, 0xd9f24e);
      this.limb(g, [[-f * 9, shoulderY + 4], [-f * 12 - swing, shoulderY + 24], [-f * 10, hipY - 2]], 7, 0x33405c);
    }
  }

  private drawHanging(sim: RigSim): void {
    const g = this.gfx;
    const grip = sim.pointAt(this.hangSide * RIG.railOffset, RIG.railHeight - 4);
    const panic = Math.sin(this.hangTimer * 26) * 4;
    g.setPosition(grip.x, grip.y).setRotation(sim.angle * 0.3);

    // Arms up to the rail, body swinging below.
    this.limb(g, [[0, 0], [-this.hangSide * 6, 26], [-this.hangSide * 4 + panic * 0.4, 46]], 8, 0xd9f24e);
    g.fillStyle(INK, 1);
    g.fillRoundedRect(-14 - this.hangSide * 4, 40, 28, 42, 8);
    g.fillStyle(this.tint(0xd9f24e), 1);
    g.fillRoundedRect(-12 - this.hangSide * 4, 43, 24, 30, 6);
    g.fillStyle(this.tint(0xf4f7ff), 0.9);
    g.fillRect(-12 - this.hangSide * 4, 54, 24, 3.5);

    // Legs kicking.
    this.limb(g, [[-this.hangSide * 4, 78], [-this.hangSide * 12 + panic, 104], [-this.hangSide * 6 + panic * 1.6, 126]], 9, 0x2f3a52);
    this.limb(g, [[-this.hangSide * 4, 78], [this.hangSide * 6 - panic, 106], [this.hangSide * 12 - panic * 1.4, 124]], 9, 0x2f3a52);

    // Head, tipped back.
    g.fillStyle(INK, 1);
    g.fillCircle(-this.hangSide * 10, 34, 10.5);
    g.fillStyle(this.tint(0xe8b48c), 1);
    g.fillCircle(-this.hangSide * 10, 34, 9);
    g.fillStyle(this.tint(0xf2f4f7), 1);
    g.slice(-this.hangSide * 10, 33, 11, Math.PI, Math.PI * 2, false);
    g.fillPath();
  }

  private drawFalling(): void {
    const g = this.gfx;
    g.clear();
    g.setAlpha(1).setPosition(this.fallX, this.fallY).setRotation(this.fallSpin);

    const flail = Math.sin(this.fallSpin * 6) * 14;
    this.limb(g, [[0, -10], [-22, -34 + flail], [-30, -52]], 8, 0xd9f24e);
    this.limb(g, [[0, -10], [24, -30 - flail], [32, -50]], 8, 0xd9f24e);
    g.fillStyle(INK, 1);
    g.fillRoundedRect(-14, -32, 28, 44, 8);
    g.fillStyle(0xd9f24e, 1);
    g.fillRoundedRect(-12, -29, 24, 32, 6);
    this.limb(g, [[-6, 10], [-18, 34 - flail], [-14, 56]], 9, 0x2f3a52);
    this.limb(g, [[6, 10], [20, 32 + flail], [16, 54]], 9, 0x2f3a52);
    g.fillStyle(INK, 1);
    g.fillCircle(0, -42, 10.5);
    g.fillStyle(0xe8b48c, 1);
    g.fillCircle(0, -42, 9);
  }
}
