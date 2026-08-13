import Phaser from 'phaser';
import { DEPTH, PANE, VIEW } from '../config';
import { audio } from '../audio/AudioEngine';
import { Hazard, HazardContext } from './Hazard';
import { WindowPane } from '../world/WindowPane';

type Phase = 'shout' | 'burst' | 'storm' | 'done';

const INK = 0x0a0e16;

/**
 * The set-piece. A dispute upstairs is resolved through the glazing, and the
 * aftermath is a survival window. Heavily telegraphed — the shouting and the
 * spidering cracks give you time to get to the middle of the deck and brace.
 */
export class Defenestration implements Hazard {
  alive = true;
  phase: Phase = 'shout';

  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly pane: WindowPane;
  private t = 0;
  private cracks: number[][] = [];
  private crackCount = 0;
  private shoutTimer = 0;

  private bodyX = 0;
  private bodyY = 0;
  private bodyVX = 0;
  private bodyVY = 0;
  private bodySpin = 0;
  private bodyLive = false;
  private bodyHitDone = false;
  private bodyBounced = false;

  constructor(
    private readonly scene: Phaser.Scene,
    ctx: HazardContext,
    pane: WindowPane,
  ) {
    this.pane = pane;
    this.gfx = scene.add.graphics().setDepth(DEPTH.hazard);
    this.glow = scene.add
      .image(pane.cx, pane.cy, 'glow')
      .setDisplaySize(PANE.width * 2.6, PANE.height * 2.6)
      .setTint(0xff7a4d)
      .setAlpha(0)
      .setDepth(DEPTH.hazardBack)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.buildCracks();
    ctx.fx.banner('SOMETHING IS HAPPENING INSIDE', '#ff5a4d', 'get to the middle of the deck');
    audio.play('stinger', { volume: 0.9 });
  }

  /** True while the aftermath is still raining down, so the director keeps spawning. */
  get stormActive(): boolean {
    return this.phase === 'storm';
  }

  update(dt: number, ctx: HazardContext): void {
    this.t += dt;

    switch (this.phase) {
      case 'shout':
        this.updateShout(dt, ctx);
        break;
      case 'burst':
        this.updateBurst(dt, ctx);
        break;
      case 'storm':
        this.updateStorm(dt, ctx);
        break;
      case 'done':
        this.alive = false;
        this.destroy();
        return;
    }

    this.draw();
  }

  destroy(): void {
    this.gfx.destroy();
    this.glow.destroy();
    this.alive = false;
  }

  /* ------------------------------------------------------------------- */

  private updateShout(dt: number, ctx: HazardContext): void {
    this.glow.setAlpha(0.1 + Math.abs(Math.sin(this.t * 7)) * 0.28);
    this.crackCount = Math.floor(Phaser.Math.Clamp(this.t / 2.1, 0, 1) * this.cracks.length);

    this.shoutTimer -= dt;
    if (this.shoutTimer <= 0) {
      this.shoutTimer = 0.42;
      audio.play('glassCrack', { volume: 0.35 });
      ctx.fx.shake(0.08, 90);
    }

    if (this.t > 2.3) {
      this.phase = 'burst';
      this.t = 0;
      this.detonate(ctx);
    }
  }

  private detonate(ctx: HazardContext): void {
    const dir = Math.sign(ctx.sim.worldX - this.pane.cx) || 1;

    this.bodyLive = true;
    this.bodyX = this.pane.cx;
    this.bodyY = this.pane.cy;
    this.bodyVX = dir * Phaser.Math.Between(190, 260);
    this.bodyVY = 60;
    this.bodySpin = Phaser.Math.FloatBetween(-1.6, 1.6);

    audio.play('glassBreak', { volume: 1 });
    audio.play('stinger', { volume: 0.7 });
    ctx.fx.glass(this.pane.cx, this.pane.cy, 1);
    ctx.fx.flash(0xffe3c0, 0.5, 220);
    ctx.fx.shake(1, 620);
    ctx.fx.hitStop(0.25, 140);
    ctx.fx.banner('BRACE', '#ff5a4d', 'survive the aftermath');

    ctx.sim.addImpulse(dir * -24);
    ctx.sim.addSwayImpulse(dir * 90);
    ctx.sim.addBob(-70);
  }

  private updateBurst(dt: number, ctx: HazardContext): void {
    this.glow.setAlpha(Math.max(0, 0.5 - this.t));
    this.updateBody(dt, ctx);
    if (this.t > 1.1) {
      this.phase = 'storm';
      this.t = 0;
    }
  }

  private updateStorm(dt: number, ctx: HazardContext): void {
    this.updateBody(dt, ctx);
    // Continuous glass rain from the broken opening.
    if (Math.random() < dt * 9) {
      ctx.fx.glass(this.pane.cx + Phaser.Math.Between(-70, 70), this.pane.cy + 40, 0.25);
    }
    if (this.t > 9) this.phase = 'done';
  }

  private updateBody(dt: number, ctx: HazardContext): void {
    if (!this.bodyLive) return;
    this.bodyVY += 1200 * dt;
    this.bodyX += this.bodyVX * dt;
    this.bodyY += this.bodyVY * dt;
    this.bodySpin += dt * 3.4;

    if (!this.bodyHitDone && !ctx.washer.isDown) {
      const chest = ctx.sim.pointAt(ctx.washer.localX, 54);
      if (Phaser.Math.Distance.Between(this.bodyX, this.bodyY, chest.x, chest.y) < 52) {
        this.bodyHitDone = true;
        ctx.hit(26, Math.sign(this.bodyVX) * 220, 'executive');
        ctx.fx.hitStop(0.2, 120);
        ctx.fx.shake(0.8, 300);
        audio.play('bodyHit', { volume: 1 });
      }
    }

    // Clipping the deck sends the whole rig lurching.
    const cos = Math.cos(ctx.sim.angle) || 1;
    const offset = (this.bodyX - ctx.sim.worldX) / cos;
    const deckPoint = ctx.sim.pointAt(Phaser.Math.Clamp(offset, -420, 420), 0);
    if (
      !this.bodyBounced &&
      this.bodyVY > 0 &&
      this.bodyY > deckPoint.y - 20 &&
      this.bodyY < deckPoint.y + 30 &&
      Math.abs(offset) < 430
    ) {
      this.bodyBounced = true;
      this.bodyVY = -this.bodyVY * 0.35;
      this.bodyVX *= 1.2;
      ctx.sim.addImpulse(offset * 0.05);
      ctx.sim.addBob(120);
      ctx.fx.impact(this.bodyX, this.bodyY);
      ctx.fx.shake(0.7, 320);
      audio.play('bodyHit', { volume: 0.8 });
    }

    if (this.bodyY > ctx.sim.surfaceY + VIEW.H || this.bodyX < -260 || this.bodyX > VIEW.W + 260) {
      this.bodyLive = false;
    }
  }

  /* --------------------------------------------------------------- visual */

  private buildCracks(): void {
    const cx = this.pane.cx;
    const cy = this.pane.cy;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + Math.random() * 0.4;
      const len = Phaser.Math.Between(30, 95);
      this.cracks.push([
        cx,
        cy,
        cx + Math.cos(a) * len * 0.5 + Phaser.Math.Between(-10, 10),
        cy + Math.sin(a) * len * 0.5,
        cx + Math.cos(a) * len,
        cy + Math.sin(a) * len * 0.85,
      ]);
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    if (this.phase === 'shout') {
      g.lineStyle(2, 0xdff1ff, 0.85);
      for (let i = 0; i < this.crackCount; i++) {
        const c = this.cracks[i];
        g.beginPath();
        g.moveTo(c[0], c[1]);
        g.lineTo(c[2], c[3]);
        g.lineTo(c[4], c[5]);
        g.strokePath();
      }
      g.lineStyle(1, 0x9fc6e8, 0.5);
      g.strokeCircle(this.pane.cx, this.pane.cy, 14 + this.crackCount * 2);
    } else {
      // The empty frame left behind, with jagged remnants.
      g.fillStyle(0x04060b, 1);
      g.fillRect(this.pane.cx - PANE.width / 2, this.pane.cy - PANE.height / 2, PANE.width, PANE.height);
      g.fillStyle(0xffb37a, 0.12);
      g.fillRect(this.pane.cx - PANE.width / 2, this.pane.cy - PANE.height / 2, PANE.width, PANE.height * 0.4);
      g.fillStyle(0x9fd4f2, 0.5);
      for (let i = 0; i < 7; i++) {
        const x = this.pane.cx - PANE.width / 2 + (i + 0.5) * (PANE.width / 7);
        const top = this.pane.cy - PANE.height / 2;
        g.fillTriangle(x - 12, top, x + 12, top, x + Phaser.Math.Between(-5, 5), top + 16 + (i % 3) * 9);
      }
    }

    if (this.bodyLive) this.drawBody(g);
  }

  /** A tumbling executive: suit, tie, and an expression of deep surprise. */
  private drawBody(g: Phaser.GameObjects.Graphics): void {
    g.save();
    g.translateCanvas(this.bodyX, this.bodyY);
    g.rotateCanvas(this.bodySpin);

    const flail = Math.sin(this.bodySpin * 5) * 15;
    for (const [w, c] of [
      [11, INK],
      [7, 0x1e2436],
    ] as Array<[number, number]>) {
      g.lineStyle(w, c, 1);
      g.beginPath();
      g.moveTo(-4, 6);
      g.lineTo(-20, 30 + flail);
      g.lineTo(-16, 52);
      g.strokePath();
      g.beginPath();
      g.moveTo(6, 6);
      g.lineTo(22, 28 - flail);
      g.lineTo(18, 50);
      g.strokePath();
      g.beginPath();
      g.moveTo(-6, -20);
      g.lineTo(-26, -34 - flail);
      g.strokePath();
      g.beginPath();
      g.moveTo(8, -20);
      g.lineTo(28, -30 + flail);
      g.strokePath();
    }

    g.fillStyle(INK, 1);
    g.fillRoundedRect(-15, -30, 30, 44, 7);
    g.fillStyle(0x232a3d, 1);
    g.fillRoundedRect(-13, -28, 26, 40, 6);
    g.fillStyle(0xf1f3f7, 1);
    g.fillTriangle(-5, -28, 5, -28, 0, -14);
    g.fillStyle(0xb5453a, 1);
    g.fillTriangle(-3, -20, 3, -20, 0, 4);

    g.fillStyle(INK, 1);
    g.fillCircle(0, -40, 11);
    g.fillStyle(0xe8b48c, 1);
    g.fillCircle(0, -40, 9.4);
    g.fillStyle(0x1a1410, 1);
    g.fillEllipse(0, -47, 17, 7);
    g.fillStyle(0x0d1220, 1);
    g.fillEllipse(-3.5, -41, 3, 4);
    g.fillEllipse(3.5, -41, 3, 4);
    g.fillEllipse(0, -34, 7, 5);

    g.restore();
    void this.scene;
  }
}
