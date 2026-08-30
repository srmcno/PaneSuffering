import Phaser from 'phaser';
import { DEPTH, PANE, TOWER } from '../config';
import { audio } from '../audio/AudioEngine';
import { Hazard, HazardContext } from './Hazard';
import { WindowPane } from '../world/WindowPane';

type Phase = 'latch' | 'swing' | 'hold' | 'close' | 'done';

const OPEN_ANGLE = 1.16;

/**
 * An office window bangs open on its top hinge and the free edge scythes down
 * through the deck. Telegraphed for most of a second by a rattling latch and a
 * lit frame, so the dodge is always a decision rather than a reflex check.
 */
export class SwingWindow implements Hazard {
  alive = true;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly pane: WindowPane;
  private readonly dir: -1 | 1;
  private phase: Phase = 'latch';
  private t = 0;
  private open = 0;
  private hasHit = false;
  private shaveClaimed = false;
  private throwsSomething: boolean;

  constructor(scene: Phaser.Scene, ctx: HazardContext, pane: WindowPane) {
    this.pane = pane;
    // The leaf always swings inward across the face. Hinging the other way
    // sends the outermost panes' leaves out over open sky, where they are
    // neither a threat nor believable.
    this.dir = pane.cx <= TOWER.centerX ? -1 : 1;
    this.throwsSomething = Math.random() < 0.35;

    this.gfx = scene.add.graphics().setDepth(DEPTH.hazard);
    // The opening is a hole in the building, so it belongs behind the rig and
    // the washer; only the leaf itself is out here in front of them.
    this.back = scene.add.graphics().setDepth(DEPTH.hazardBack);
    this.glow = scene.add
      .image(pane.cx, pane.cy, 'glow')
      .setDisplaySize(PANE.width * 2.2, PANE.height * 2.2)
      .setTint(0xffd9a0)
      .setAlpha(0)
      .setDepth(DEPTH.hazardBack)
      .setBlendMode(Phaser.BlendModes.ADD);

    audio.play('ratchet', { volume: 0.7 });
  }

  update(dt: number, ctx: HazardContext): void {
    this.t += dt;

    switch (this.phase) {
      case 'latch':
        // Rattle and light up before anything actually moves.
        this.glow.setAlpha(0.15 + Math.abs(Math.sin(this.t * 22)) * 0.3);
        if (this.t > 0.85) {
          this.phase = 'swing';
          this.t = 0;
          audio.play('glassCrack', { volume: 0.5 });
        }
        break;

      case 'swing': {
        this.open = Phaser.Math.Easing.Back.Out(Math.min(1, this.t / 0.3));
        if (this.t >= 0.3) {
          this.phase = 'hold';
          this.t = 0;
          audio.play('thud', { volume: 0.8, detune: 90 });
          ctx.fx.shake(0.3, 160);
          ctx.sim.addImpulse((this.pane.cx - ctx.sim.worldX) * 0.012);
          if (this.throwsSomething) this.hurl(ctx);
        }
        break;
      }

      case 'hold':
        this.open = 1 + Math.sin(this.t * 15) * 0.03 * Math.max(0, 1 - this.t * 1.6);
        if (this.t > 0.75) {
          this.phase = 'close';
          this.t = 0;
        }
        break;

      case 'close':
        this.open = 1 - Phaser.Math.Easing.Quadratic.In(Math.min(1, this.t / 0.55));
        this.glow.setAlpha(0.35 * this.open);
        if (this.t >= 0.55) {
          this.phase = 'done';
          audio.play('thud', { volume: 0.35, detune: 260 });
          this.alive = false;
          this.destroy();
          return;
        }
        break;

      case 'done':
        return;
    }

    if (this.open > 0.25) this.checkHit(ctx);
    this.draw(ctx);
  }

  destroy(): void {
    this.gfx.destroy();
    this.back.destroy();
    this.glow.destroy();
    this.alive = false;
  }

  /** Corners of the swinging leaf, pivoting on its inner top corner. */
  private corners(): Phaser.Math.Vector2[] {
    const hx = this.pane.cx - this.dir * (PANE.width / 2);
    const hy = this.pane.cy - PANE.height / 2;
    // The angle stays positive for both sides: `dir` mirrors the leaf in x
    // only. Turning the rotation around with it swung the left-hand leaves up
    // into the sky instead of down through the deck.
    const a = this.open * OPEN_ANGLE;
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    const pt = (lx: number, ly: number) =>
      new Phaser.Math.Vector2(hx + (lx * cos - ly * sin) * this.dir, hy + (lx * sin + ly * cos));

    return [pt(0, 0), pt(PANE.width, 0), pt(PANE.width, PANE.height), pt(0, PANE.height)];
  }

  private checkHit(ctx: HazardContext): void {
    if (this.hasHit || ctx.washer.isDown) return;

    const c = this.corners();
    const poly = new Phaser.Geom.Polygon([c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y]);
    const head = ctx.sim.pointAt(ctx.washer.localX, ctx.washer.isCrouched ? 44 : 82);
    const chest = ctx.sim.pointAt(ctx.washer.localX, ctx.washer.isCrouched ? 24 : 54);

    const caught =
      Phaser.Geom.Polygon.Contains(poly, head.x, head.y) || Phaser.Geom.Polygon.Contains(poly, chest.x, chest.y);

    if (caught) {
      if (ctx.washer.isCrouched) {
        // Ducked under the leaf as it passed.
        if (!this.shaveClaimed) {
          this.shaveClaimed = true;
          ctx.closeShave(head.x, head.y - 20);
        }
        return;
      }
      this.hasHit = true;
      ctx.hit(15, this.dir * 150, 'window');
      ctx.sim.addImpulse((this.pane.cx - ctx.sim.worldX) * 0.022);
      ctx.fx.impact(chest.x, chest.y);
      ctx.fx.glass(chest.x, chest.y, 0.4);
    }
  }

  /** Sometimes an occupant lobs their frustration out of the opening. */
  private hurl(ctx: HazardContext): void {
    ctx.fx.popup(this.pane.cx, this.pane.cy - 40, 'INCOMING!', '#ff8a5a');
    audio.play('buzz', { volume: 0.5 });
    ctx.scene.events.emit('hazard:hurl', {
      x: this.pane.cx,
      y: this.pane.cy,
      vx: (ctx.sim.worldX - this.pane.cx) * 1.5,
    });
  }

  private draw(ctx: HazardContext): void {
    const g = this.gfx;
    const b = this.back;
    g.clear();
    b.clear();
    if (this.open <= 0.001) return;

    const c = this.corners();

    // Dark opening left behind the leaf.
    b.fillStyle(0x05070d, Math.min(1, this.open * 1.3));
    b.fillRect(this.pane.cx - PANE.width / 2, this.pane.cy - PANE.height / 2, PANE.width, PANE.height);
    b.fillStyle(0xffd9a0, 0.14 * this.open);
    b.fillRect(this.pane.cx - PANE.width / 2, this.pane.cy - PANE.height / 2, PANE.width, PANE.height * 0.35);

    // The leaf: dark frame, tinted glass, a raking highlight.
    g.fillStyle(0x0a0e16, 1);
    g.fillPoints([c[0], c[1], c[2], c[3]], true, true);
    g.fillStyle(0x2b4a68, 0.9);
    const inset = this.inset(c, 6);
    g.fillPoints(inset, true, true);
    g.fillStyle(0xbfe4ff, 0.22);
    g.fillPoints([inset[0], inset[1], inset[2]], true, true);
    g.lineStyle(3, 0x8792a6, 1);
    g.strokePoints([c[0], c[1], c[2], c[3]], true, true);

    // Hinge hardware.
    g.fillStyle(0xa8b3c6, 1);
    g.fillCircle(c[0].x, c[0].y, 5);
    g.fillCircle(c[1].x, c[1].y, 5);

    // Motion smear on the leading edge while it is actually moving.
    if (this.phase === 'swing') {
      g.lineStyle(10, 0xffffff, 0.1);
      g.lineBetween(c[2].x, c[2].y, c[3].x, c[3].y);
    }

    this.glow.setAlpha(0.1 + this.open * 0.3);
    void ctx;
  }

  private inset(c: Phaser.Math.Vector2[], amount: number): Phaser.Math.Vector2[] {
    const cx = (c[0].x + c[1].x + c[2].x + c[3].x) / 4;
    const cy = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;
    return c.map((p) => {
      const dx = cx - p.x;
      const dy = cy - p.y;
      const len = Math.hypot(dx, dy) || 1;
      return new Phaser.Math.Vector2(p.x + (dx / len) * amount, p.y + (dy / len) * amount);
    });
  }
}
