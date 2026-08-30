import Phaser from 'phaser';
import { DEPTH, RIG, VIEW } from '../config';
import { audio } from '../audio/AudioEngine';
import { Hazard, HazardContext } from './Hazard';

type Phase = 'approach' | 'perch' | 'leave';

const INK = 0x0a0e16;

/**
 * A pigeon. It lands on the low rail, which is a real weight on one end of the
 * deck, and it will happily undo a pane you just finished. Walking at it
 * shoos it off — which is the point: dealing with it costs you position.
 */
export class Pigeon implements Hazard {
  alive = true;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private phase: Phase = 'approach';
  private x: number;
  private y: number;
  private vx = 0;
  private vy = 0;
  private readonly side: -1 | 1;
  private readonly perchOffset: number;
  private wingPhase = 0;
  private bob = 0;
  private perchTimer: number;
  private cooTimer = 1.4;
  private hasSoiled = false;
  private facing: -1 | 1;

  constructor(scene: Phaser.Scene, ctx: HazardContext) {
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.facing = -this.side as -1 | 1;
    this.perchOffset = this.side * Phaser.Math.Between(RIG.walkLimit - 30, RIG.railOffset);
    this.perchTimer = Phaser.Math.FloatBetween(5.5, 9);

    const target = ctx.sim.pointAt(this.perchOffset, RIG.railHeight);
    this.x = target.x + this.side * (VIEW.W * 0.6);
    this.y = target.y - Phaser.Math.Between(90, 220);

    this.gfx = scene.add.graphics().setDepth(DEPTH.hazard);
    audio.play('flap', { volume: 0.5 });
  }

  /** A perched bird is genuinely heavy at the end of a long lever. */
  get load(): { offset: number; mass: number } | undefined {
    return this.phase === 'perch' ? { offset: this.perchOffset, mass: 0.34 } : undefined;
  }

  update(dt: number, ctx: HazardContext): void {
    const perch = ctx.sim.pointAt(this.perchOffset, RIG.railHeight + 8);
    this.wingPhase += dt * (this.phase === 'perch' ? 2 : 17);

    switch (this.phase) {
      case 'approach': {
        // Ease in on a lazy arc rather than a straight line.
        this.x = Phaser.Math.Linear(this.x, perch.x, Math.min(1, dt * 1.6));
        this.y = Phaser.Math.Linear(this.y, perch.y, Math.min(1, dt * 2.1)) + Math.sin(this.wingPhase * 0.4) * 0.6;
        this.facing = this.x > perch.x ? -1 : 1;
        if (Phaser.Math.Distance.Between(this.x, this.y, perch.x, perch.y) < 6) {
          this.phase = 'perch';
          ctx.sim.addImpulse(this.perchOffset * 0.005);
          ctx.fx.feathers(this.x, this.y);
          audio.play('coo', { volume: 0.7 });
        }
        break;
      }

      case 'perch': {
        this.x = perch.x;
        this.y = perch.y;
        this.bob += dt * 6;
        this.perchTimer -= dt;
        this.cooTimer -= dt;
        if (this.cooTimer <= 0) {
          this.cooTimer = Phaser.Math.FloatBetween(2.4, 4.5);
          audio.play('coo', { volume: 0.45 });
        }
        // Restless hopping keeps the deck honest.
        if (Math.random() < dt * 0.8) {
          ctx.sim.addImpulse(this.perchOffset * 0.0025);
          ctx.fx.feathers(this.x, this.y - 6);
        }

        const washer = ctx.sim.pointAt(ctx.washer.localX, 40);
        if (Phaser.Math.Distance.Between(this.x, this.y, washer.x, washer.y) < 96 || this.perchTimer <= 0) {
          this.takeOff(ctx, this.perchTimer > 0);
        }
        break;
      }

      case 'leave': {
        this.vy += 40 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (!this.hasSoiled && this.y < perch.y - 40) this.soilPane(ctx);
        if (this.x < -160 || this.x > VIEW.W + 160 || this.y < ctx.sim.surfaceY - 900) {
          this.destroy();
          return;
        }
        break;
      }
    }

    this.draw();
  }

  destroy(): void {
    this.gfx.destroy();
    this.alive = false;
  }

  private takeOff(ctx: HazardContext, startled: boolean): void {
    this.phase = 'leave';
    this.vx = -this.facing * Phaser.Math.Between(130, 220);
    this.vy = -Phaser.Math.Between(150, 240);
    // Kicking off the rail shoves it; a startled bird shoves harder.
    ctx.sim.addImpulse(this.perchOffset * (startled ? 0.009 : 0.004));
    ctx.fx.feathers(this.x, this.y);
    audio.play('flap', { volume: 0.85 });
  }

  /** Parting gift: re-soil a pane on the working floor, preferring a clean one. */
  private soilPane(ctx: HazardContext): void {
    this.hasSoiled = true;
    const panes = ctx.tower.panesOnFloor(ctx.floor);
    if (panes.length === 0) return;
    const clean = panes.filter((p) => p.progress > 0.45);
    if (clean.length === 0) return;

    const pane = clean[Phaser.Math.Between(0, clean.length - 1)];
    pane.soil(pane.cx + Phaser.Math.Between(-50, 50), pane.cy + Phaser.Math.Between(-40, 40));
    ctx.fx.popup(pane.cx, pane.cy, 'RE-SOILED', '#ff8a5a');
    audio.play('splat', { volume: 0.8 });
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.setPosition(this.x, this.y);

    const f = this.facing;
    const hop = this.phase === 'perch' ? Math.sin(this.bob) * 1.2 : 0;
    const flap = this.phase === 'perch' ? 0 : Math.sin(this.wingPhase) * 0.9;

    // Tail.
    g.fillStyle(INK, 1);
    g.fillTriangle(-f * 10, hop - 4, -f * 26, hop - 10, -f * 24, hop + 2);
    g.fillStyle(0x767f95, 1);
    g.fillTriangle(-f * 10, hop - 4, -f * 24, hop - 9, -f * 22, hop + 1);

    // Body.
    g.fillStyle(INK, 1);
    g.fillEllipse(0, hop - 4, 30, 21);
    g.fillStyle(0x8e97ab, 1);
    g.fillEllipse(0, hop - 5, 26, 18);

    // Wing, folded or beating.
    g.save();
    g.translateCanvas(-f * 3, hop - 7);
    g.rotateCanvas(flap * 0.8);
    g.fillStyle(INK, 1);
    g.fillEllipse(0, 0, 24, 11);
    g.fillStyle(0x5f6a80, 1);
    g.fillEllipse(0, -1, 21, 8);
    g.restore();

    // Neck iridescence and head.
    g.fillStyle(0x3f7f76, 1);
    g.fillEllipse(f * 9, hop - 11, 12, 12);
    g.fillStyle(INK, 1);
    g.fillCircle(f * 13, hop - 17, 8);
    g.fillStyle(0x9aa3b7, 1);
    g.fillCircle(f * 13, hop - 17, 6.6);
    g.fillStyle(0xf6b73c, 1);
    g.fillTriangle(f * 19, hop - 18, f * 27, hop - 16, f * 19, hop - 14);
    g.fillStyle(0xd94f3d, 1);
    g.fillCircle(f * 15.5, hop - 19, 1.6);

    // Feet, only when perched.
    if (this.phase === 'perch') {
      g.lineStyle(2, 0xd94f3d, 1);
      g.lineBetween(-2, hop + 4, -2, hop + 10);
      g.lineBetween(5, hop + 4, 5, hop + 10);
    }
  }
}
