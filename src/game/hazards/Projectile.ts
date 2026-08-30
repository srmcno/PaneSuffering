import Phaser from 'phaser';
import { DEPTH, VIEW } from '../config';
import { audio } from '../audio/AudioEngine';
import { Hazard, HazardContext } from './Hazard';

const INK = 0x0a0e16;

/** Something an occupant throws out of an open window, sideways rather than down. */
export class Projectile implements Hazard {
  alive = true;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private x: number;
  private y: number;
  private vx: number;
  private vy = -120;
  private spin = 0;
  private closest = Infinity;
  private hasHit = false;

  constructor(scene: Phaser.Scene, x: number, y: number, vx: number) {
    this.x = x;
    this.y = y;
    this.vx = Phaser.Math.Clamp(vx, -520, 520);
    this.gfx = scene.add.graphics().setDepth(DEPTH.hazard);
    audio.play('click', { volume: 0.4, detune: -180 });
  }

  update(dt: number, ctx: HazardContext): void {
    this.vy += 900 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += dt * 9;

    const chest = ctx.sim.pointAt(ctx.washer.localX, 54);
    const d = Phaser.Math.Distance.Between(this.x, this.y, chest.x, chest.y);
    this.closest = Math.min(this.closest, d);

    if (!this.hasHit && d < 26 && !ctx.washer.isDown && !ctx.washer.isCrouched) {
      this.hasHit = true;
      ctx.hit(8, Math.sign(this.vx || 1) * 40, 'thrown');
      ctx.fx.impact(this.x, this.y);
      this.alive = false;
      this.destroy();
      return;
    }

    if (this.y > ctx.sim.surfaceY + VIEW.H * 0.6 || this.x < -120 || this.x > VIEW.W + 120) {
      if (this.closest < 60) ctx.closeShave(chest.x, chest.y - 30);
      this.alive = false;
      this.destroy();
      return;
    }

    this.draw();
  }

  destroy(): void {
    this.gfx.destroy();
    this.alive = false;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.setPosition(this.x, this.y).setRotation(this.spin);
    g.fillStyle(INK, 1);
    g.fillRoundedRect(-11, -8, 22, 16, 3);
    g.fillStyle(0xb5453a, 1);
    g.fillRoundedRect(-9, -6, 18, 12, 2);
    g.fillStyle(0x8792a6, 1);
    g.fillRect(-4, -9, 8, 4);
  }
}
