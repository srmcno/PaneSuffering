import Phaser from 'phaser';
import { DEPTH, RIG, VIEW } from '../config';
import { audio } from '../audio/AudioEngine';
import { Hazard, HazardContext } from './Hazard';

interface DebrisKind {
  id: string;
  heavy: boolean;
  damage: number;
  radius: number;
  label: string;
  draw(g: Phaser.GameObjects.Graphics): void;
}

const INK = 0x0a0e16;

const LIGHT: DebrisKind[] = [
  {
    id: 'cup',
    heavy: false,
    damage: 9,
    radius: 15,
    label: 'COFFEE',
    draw(g) {
      g.fillStyle(INK, 1);
      g.fillRoundedRect(-13, -15, 26, 30, 4);
      g.fillStyle(0xf1f3f7, 1);
      g.fillRoundedRect(-11, -13, 22, 26, 3);
      g.fillStyle(0x9c3b2c, 1);
      g.fillRect(-11, -13, 22, 8);
      g.fillStyle(0x5b3220, 1);
      g.fillEllipse(0, -13, 22, 7);
    },
  },
  {
    id: 'phone',
    heavy: false,
    damage: 11,
    radius: 17,
    label: 'DESK PHONE',
    draw(g) {
      g.fillStyle(INK, 1);
      g.fillRoundedRect(-18, -11, 36, 22, 4);
      g.fillStyle(0x2b3140, 1);
      g.fillRoundedRect(-16, -9, 32, 18, 3);
      g.fillStyle(0x59627a, 1);
      g.fillRoundedRect(-14, -14, 28, 8, 4);
      g.lineStyle(2, 0x1b2130, 1);
      g.strokeCircle(-6, 2, 4);
    },
  },
  {
    id: 'binder',
    heavy: false,
    damage: 10,
    radius: 18,
    label: 'PAPERWORK',
    draw(g) {
      g.fillStyle(INK, 1);
      g.fillRect(-17, -20, 34, 40);
      g.fillStyle(0x2f5f8a, 1);
      g.fillRect(-15, -18, 30, 36);
      g.fillStyle(0xe8ecf4, 1);
      g.fillRect(-6, -18, 20, 36);
      g.fillStyle(0x9fb0c6, 1);
      for (let i = 0; i < 4; i++) g.fillRect(-4, -14 + i * 9, 16, 2);
    },
  },
];

const HEAVY: DebrisKind[] = [
  {
    id: 'masonry',
    heavy: true,
    damage: 24,
    radius: 26,
    label: 'MASONRY',
    draw(g) {
      g.fillStyle(INK, 1);
      g.fillTriangle(-26, 16, 4, -24, 27, 12);
      g.fillStyle(0x5c6478, 1);
      g.fillTriangle(-22, 13, 3, -20, 23, 10);
      g.fillStyle(0x828da3, 1);
      g.fillTriangle(-22, 13, 3, -20, -4, 8);
      g.fillStyle(0x3a4152, 1);
      g.fillCircle(8, 0, 4);
    },
  },
  {
    id: 'cabinet',
    heavy: true,
    damage: 27,
    radius: 30,
    label: 'FILING CABINET',
    draw(g) {
      g.fillStyle(INK, 1);
      g.fillRect(-24, -32, 48, 64);
      g.fillStyle(0x6a7085, 1);
      g.fillRect(-22, -30, 44, 60);
      g.fillStyle(0x4c5366, 1);
      for (let i = 0; i < 3; i++) g.fillRect(-20, -27 + i * 20, 40, 17);
      g.fillStyle(0xa8b3c6, 1);
      for (let i = 0; i < 3; i++) g.fillRect(-6, -21 + i * 20, 12, 3);
    },
  },
  {
    id: 'ac',
    heavy: true,
    damage: 29,
    radius: 32,
    label: 'AC UNIT',
    draw(g) {
      g.fillStyle(INK, 1);
      g.fillRect(-30, -22, 60, 44);
      g.fillStyle(0x8792a6, 1);
      g.fillRect(-28, -20, 56, 40);
      g.fillStyle(0x39415a, 1);
      g.fillCircle(4, 0, 15);
      g.lineStyle(3, 0xa8b3c6, 1);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.lineBetween(4, 0, 4 + Math.cos(a) * 13, Math.sin(a) * 13);
      }
      g.fillStyle(0xf6b73c, 1);
      g.fillRect(-28, -20, 56, 4);
    },
  },
];

/**
 * Something falls past the rig. Light debris glances off a hard hat if you
 * crouch; heavy debris does not care about your hat, so its landing column is
 * telegraphed on the deck and you have to physically not be there.
 */
export class Debris implements Hazard {
  alive = true;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly marker: Phaser.GameObjects.Graphics;
  private readonly kind: DebrisKind;
  private x: number;
  private y: number;
  private vx: number;
  private vy: number;
  private spin = 0;
  private spinRate: number;
  private warned = false;
  private landed = false;
  private missDistance = Infinity;

  constructor(scene: Phaser.Scene, ctx: HazardContext, heavy: boolean, targetX?: number) {
    const pool = heavy ? HEAVY : LIGHT;
    this.kind = pool[Phaser.Math.Between(0, pool.length - 1)];

    const deckX = ctx.sim.worldX;
    this.x = targetX ?? deckX + Phaser.Math.Between(-RIG.walkLimit, RIG.walkLimit);
    this.y = ctx.sim.surfaceY - VIEW.H * 0.62 - 140;
    this.vx = Phaser.Math.FloatBetween(-16, 16);
    this.vy = heavy ? 210 : 260;
    this.spinRate = Phaser.Math.FloatBetween(-3.4, 3.4) * (heavy ? 0.4 : 1);

    this.gfx = scene.add.graphics().setDepth(DEPTH.hazard);
    this.marker = scene.add.graphics().setDepth(DEPTH.rigFront + 1);
  }

  update(dt: number, ctx: HazardContext): void {
    this.vy += 1080 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += this.spinRate * dt;

    const cos = Math.cos(ctx.sim.angle) || 1;
    const offset = Phaser.Math.Clamp((this.x - ctx.sim.worldX) / cos, -RIG.railOffset, RIG.railOffset);
    const impactPoint = ctx.sim.pointAt(offset, 0);

    if (!this.warned) {
      this.warned = true;
      audio.play(this.kind.heavy ? 'buzz' : 'click', { volume: 0.5 });
      if (this.kind.heavy) ctx.fx.popup(this.x, impactPoint.y - 210, `${this.kind.label} INCOMING`, '#ff5a4d');
    }

    this.drawMarker(impactPoint, offset, ctx);

    // Track the nearest approach so a dodge can be scored as a close shave.
    const washerPoint = ctx.sim.pointAt(ctx.washer.localX, 46);
    this.missDistance = Math.min(
      this.missDistance,
      Phaser.Math.Distance.Between(this.x, this.y, washerPoint.x, washerPoint.y),
    );

    if (!this.landed && !ctx.washer.isDown) {
      const dx = Math.abs(offset - ctx.washer.localX);
      const vertical = Math.abs(this.y - (washerPoint.y - 30));
      if (dx < this.kind.radius + 16 && vertical < 62) {
        // A hard hat handles a stapler. It does not handle an AC unit.
        if (!this.kind.heavy && ctx.washer.isCrouched) {
          audio.play('thud', { volume: 0.5, detune: 220 });
          ctx.fx.impact(this.x, this.y);
          ctx.fx.popup(this.x, this.y - 24, 'BONK', '#f6b73c');
          ctx.sim.addImpulse(offset * 0.006);
          this.finish();
          return;
        }
        ctx.hit(this.kind.damage, Math.sign(this.vx || 1) * 60, this.kind.id);
        ctx.sim.addImpulse(offset * (this.kind.heavy ? 0.032 : 0.012));
        ctx.fx.impact(this.x, this.y);
        this.finish();
        return;
      }
    }

    // Landing on the deck.
    if (!this.landed && this.y >= impactPoint.y - 6) {
      this.landed = true;
      ctx.sim.addImpulse(offset * (this.kind.heavy ? 0.026 : 0.008));
      ctx.sim.addBob(this.kind.heavy ? 92 : 34);
      ctx.fx.impact(impactPoint.x, impactPoint.y);
      ctx.fx.shake(this.kind.heavy ? 0.6 : 0.22, this.kind.heavy ? 260 : 130);
      audio.play('thud', { volume: this.kind.heavy ? 1 : 0.5, detune: this.kind.heavy ? -30 : 180 });
      if (this.missDistance < 92) ctx.closeShave(impactPoint.x, impactPoint.y - 40);
      // Bounce off and keep going down past the rig.
      this.vy = -this.vy * 0.32;
      this.vx += Math.sign(offset || 1) * 90;
      this.spinRate *= 1.6;
    }

    if (this.y > ctx.sim.surfaceY + VIEW.H * 0.75 || this.x < -200 || this.x > VIEW.W + 200) {
      this.finish();
      return;
    }

    this.draw();
  }

  destroy(): void {
    this.gfx.destroy();
    this.marker.destroy();
    this.alive = false;
  }

  private finish(): void {
    this.alive = false;
    this.destroy();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.setPosition(this.x, this.y).setRotation(this.spin);

    // Speed trail: the faster it falls, the longer the smear.
    const trail = Phaser.Math.Clamp(this.vy / 900, 0, 1);
    if (trail > 0.25) {
      g.fillStyle(0xffffff, 0.07 * trail);
      g.fillRect(-this.kind.radius * 0.5, -this.kind.radius - 70 * trail, this.kind.radius, 70 * trail);
    }
    this.kind.draw(g);
  }

  /** Heavy debris paints its landing column so the dodge is fair. */
  private drawMarker(point: Phaser.Math.Vector2, offset: number, ctx: HazardContext): void {
    this.marker.clear();
    if (this.landed) return;

    const dist = point.y - this.y;
    if (dist <= 0 || dist > 900) return;
    const urgency = Phaser.Math.Clamp(1 - dist / 620, 0, 1);
    const color = this.kind.heavy ? 0xff5a4d : 0xf6b73c;

    this.marker.save();
    this.marker.translateCanvas(point.x, point.y);
    this.marker.rotateCanvas(ctx.sim.angle);
    const w = this.kind.radius + 12;
    this.marker.fillStyle(color, 0.14 + urgency * 0.3);
    this.marker.fillEllipse(0, -3, w * 2, 15);
    this.marker.lineStyle(2.5, color, 0.5 + urgency * 0.5);
    this.marker.strokeEllipse(0, -3, w * 2, 15);
    if (this.kind.heavy) {
      this.marker.lineStyle(2, color, 0.22 + urgency * 0.4);
      this.marker.lineBetween(-w, -3, -w, -70 - urgency * 60);
      this.marker.lineBetween(w, -3, w, -70 - urgency * 60);
    }
    this.marker.restore();

    // Off-screen chevron so you can react before it enters frame.
    const camTop = ctx.scene.cameras.main.scrollY;
    if (this.y < camTop + 40) {
      this.marker.fillStyle(color, 0.6 + Math.sin(ctx.scene.time.now * 0.02) * 0.35);
      this.marker.fillTriangle(this.x - 14, camTop + 26, this.x + 14, camTop + 26, this.x, camTop + 48);
    }
  }
}
