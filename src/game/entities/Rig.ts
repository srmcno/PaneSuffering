import Phaser from 'phaser';
import { DEPTH, PALETTE, RIG, ROOF_Y, SIM, TOWER } from '../config';
import { RigSim } from '../systems/RigSim';

const HALF = RIG.length / 2;

/**
 * Everything you can see of the platform. Geometry is baked into two
 * containers (behind and in front of the washer) that are simply transformed
 * by the sim each frame, so the render cost is a transform, not a redraw.
 */
export class Rig {
  private readonly back: Phaser.GameObjects.Container;
  private readonly front: Phaser.GameObjects.Container;
  private readonly cables: Phaser.GameObjects.Graphics;
  private readonly water: Phaser.GameObjects.Graphics;
  private readonly lamp: Phaser.GameObjects.Arc;
  private readonly lampGlow: Phaser.GameObjects.Image;
  private lampPhase = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: RigSim,
  ) {
    this.cables = scene.add.graphics().setDepth(DEPTH.cable);
    this.back = scene.add.container(0, 0).setDepth(DEPTH.deck);
    this.front = scene.add.container(0, 0).setDepth(DEPTH.rigFront);

    this.buildDeck();
    this.buildStirrups();
    this.water = scene.add.graphics();
    this.back.add(this.water);
    this.buildKit();
    this.buildRailing();

    this.lamp = scene.add.circle(HALF - 96, -26, 7, PALETTE.amber, 1);
    this.lampGlow = scene.add
      .image(HALF - 96, -26, 'glow')
      .setDisplaySize(80, 80)
      .setTint(0xffb020)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.front.add([this.lampGlow, this.lamp]);
  }

  update(dt: number, danger: number): void {
    const x = this.sim.worldX;
    const y = this.sim.surfaceY;
    this.back.setPosition(x, y).setRotation(this.sim.angle);
    this.front.setPosition(x, y).setRotation(this.sim.angle);

    this.drawWater();
    this.drawCables();

    this.lampPhase += dt * (2.2 + danger * 9);
    const on = danger > 0.25 && Math.sin(this.lampPhase) > 0;
    this.lamp.setFillStyle(on ? 0xffd166 : 0x6b5a2a, 1);
    this.lampGlow.setAlpha(on ? 0.55 * danger : 0);
  }

  destroy(): void {
    this.back.destroy();
    this.front.destroy();
    this.cables.destroy();
  }

  /* -------------------------------------------------------------- geometry */

  private buildDeck(): void {
    const g = this.scene.add.graphics();

    // Underside beam and cross bracing.
    g.fillStyle(0x1b202c, 1);
    g.fillRect(-HALF, 14, RIG.length, 16);
    g.lineStyle(3, 0x2c3444, 1);
    for (let x = -HALF + 20; x < HALF; x += 96) {
      g.lineBetween(x, 30, x + 60, 14);
      g.lineBetween(x, 14, x + 60, 30);
    }

    // Deck planks.
    g.fillStyle(0x4c5468, 1);
    g.fillRect(-HALF, 0, RIG.length, 15);
    g.fillStyle(0x606a82, 1);
    g.fillRect(-HALF, 0, RIG.length, 4);
    g.fillStyle(0x2f3646, 1);
    for (let x = -HALF + 58; x < HALF; x += 58) g.fillRect(x, 0, 3, 15);

    // Non-slip grating pattern.
    g.fillStyle(0x2b3242, 0.55);
    for (let x = -HALF + 6; x < HALF - 6; x += 14) g.fillRect(x, 5, 7, 5);

    // Kick plate along the outer lip.
    g.fillStyle(0x8792a6, 1);
    g.fillRect(-HALF, -9, RIG.length, 4);
    g.fillStyle(0x59627a, 1);
    g.fillRect(-HALF, -5, RIG.length, 5);

    // End caps.
    g.fillStyle(0x39415a, 1);
    g.fillRect(-HALF - 8, -12, 12, 44);
    g.fillRect(HALF - 4, -12, 12, 44);

    this.back.add(g);
  }

  private buildStirrups(): void {
    const g = this.scene.add.graphics();
    for (const side of [-1, 1]) {
      const x = side * RIG.cableOffset;
      g.fillStyle(0x8792a6, 1);
      g.fillRect(x - 5, -104, 10, 108);
      g.fillStyle(0x5c6478, 1);
      g.fillRect(x + (side > 0 ? 3 : -5), -104, 3, 108);
      // Head casting where the cable terminates.
      g.fillStyle(0xa8b3c6, 1);
      g.fillRect(x - 13, -114, 26, 14);
      g.fillStyle(0x2b3140, 1);
      g.fillRect(x - 4, -112, 8, 10);

      // Winch housing bolted to the deck.
      g.fillStyle(0x323a4c, 1);
      g.fillRect(x - 26, -34, 52, 36);
      g.fillStyle(0x454e63, 1);
      g.fillRect(x - 26, -34, 52, 6);
      g.fillStyle(0xf6b73c, 1);
      g.fillRect(x - 20, -24, 14, 5);
      g.fillStyle(0x1d222e, 1);
      g.fillRect(x - 2, -26, 20, 18);
    }
    this.back.add(g);
  }

  /** Bucket, toolbox and coiled hose: the props that sell the job. */
  private buildKit(): void {
    const g = this.scene.add.graphics();

    // Bucket body (water is drawn separately so it can stay level).
    const bx = RIG.bucketOffset;
    g.fillStyle(0x2e3648, 1);
    g.beginPath();
    g.moveTo(bx - 24, -44);
    g.lineTo(bx + 24, -44);
    g.lineTo(bx + 16, 0);
    g.lineTo(bx - 16, 0);
    g.closePath();
    g.fillPath();
    g.lineStyle(3, 0x7d879b, 1);
    g.strokeRect(bx - 24, -46, 48, 4);
    g.beginPath();
    g.arc(bx, -46, 22, Math.PI, 0);
    g.strokePath();

    // Toolbox.
    g.fillStyle(0x8a3f2c, 1);
    g.fillRect(148, -30, 74, 30);
    g.fillStyle(0xa9503a, 1);
    g.fillRect(148, -30, 74, 6);
    g.fillStyle(0x2b3140, 1);
    g.fillRect(176, -36, 20, 7);

    // Coiled hose: concentric loops seen edge-on.
    g.lineStyle(5, 0x1d4d3c, 1);
    for (let i = 0; i < 3; i++) g.strokeEllipse(268, -9, 44 - i * 11, 17 - i * 4);
    g.lineStyle(2, 0x3f9877, 0.7);
    g.strokeEllipse(268, -9, 44, 17);

    // Spare squeegee leaning on the rail.
    g.lineStyle(4, 0x6b7488, 1);
    g.lineBetween(330, 0, 352, -66);
    g.fillStyle(0xf6b73c, 1);
    g.fillRect(340, -74, 30, 7);

    this.back.add(g);
  }

  private buildRailing(): void {
    const g = this.scene.add.graphics();
    const top = -RIG.railHeight;

    g.fillStyle(0x2b3242, 1);
    g.fillRect(-HALF, -14, RIG.length, 8);

    g.lineStyle(5, 0x7d879b, 1);
    g.lineBetween(-RIG.railOffset, top, RIG.railOffset, top);
    g.lineStyle(4, 0x646d82, 1);
    g.lineBetween(-RIG.railOffset, top + 34, RIG.railOffset, top + 34);

    g.lineStyle(6, 0x8792a6, 1);
    for (let x = -RIG.railOffset; x <= RIG.railOffset; x += RIG.railOffset) {
      g.lineBetween(x, 2, x, top - 4);
    }
    g.lineStyle(4, 0x646d82, 1);
    for (let x = -RIG.railOffset + 168; x < RIG.railOffset; x += 168) {
      g.lineBetween(x, 0, x, top);
    }

    // Hazard striping on the outer posts.
    g.fillStyle(0xf6b73c, 1);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        g.fillRect(side * RIG.railOffset - 3, top + 6 + i * 16, 6, 7);
      }
    }
    this.front.add(g);
  }

  /* --------------------------------------------------------------- dynamic */

  /** The bucket's contents stay level with the world, not the deck. */
  private drawWater(): void {
    this.water.clear();
    const tilt = -this.sim.angle;
    const slosh = Phaser.Math.Clamp(this.sim.angVel * 9, -12, 12);
    this.water.fillStyle(0x2f7fb8, 0.85);
    this.water.save();
    this.water.translateCanvas(RIG.bucketOffset, -22);
    this.water.rotateCanvas(tilt);
    this.water.fillRect(-19, -4 + slosh * 0.3, 38, 22);
    this.water.fillStyle(0x8fd0f0, 0.7);
    this.water.fillRect(-19, -4 + slosh * 0.3, 38, 3);
    this.water.restore();
  }

  private drawCables(): void {
    this.cables.clear();
    const anchorY = ROOF_Y - 62;

    for (const side of [-1, 1]) {
      const anchorX = TOWER.centerX + side * RIG.cableOffset;
      const end = this.sim.pointAt(side * RIG.cableOffset, 114);
      const midX = (anchorX + end.x) / 2 + side * 4;
      const midY = (anchorY + end.y) / 2 + 14;

      this.cables.lineStyle(6, 0x0d111a, 0.45);
      this.strokeCable(anchorX + 2, anchorY + 2, midX + 2, midY + 2, end.x + 2, end.y + 2);
      this.cables.lineStyle(4, 0x99a3b8, 1);
      this.strokeCable(anchorX, anchorY, midX, midY, end.x, end.y);
      this.cables.lineStyle(1.5, 0xd4dcea, 0.7);
      this.strokeCable(anchorX - 1, anchorY, midX - 1, midY, end.x - 1, end.y);

      // Slack tail hanging below the deck.
      const tail = this.sim.pointAt(side * RIG.cableOffset, -6);
      this.cables.lineStyle(3, 0x7c869d, 0.85);
      this.cables.beginPath();
      this.cables.moveTo(tail.x, tail.y);
      this.cables.lineTo(tail.x + side * 10, tail.y + 78);
      this.cables.lineTo(tail.x - side * 4, tail.y + 128);
      this.cables.strokePath();
    }
  }

  private strokeCable(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): void {
    this.cables.beginPath();
    this.cables.moveTo(x0, y0);
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const it = 1 - t;
      this.cables.lineTo(it * it * x0 + 2 * it * t * cx + t * t * x1, it * it * y0 + 2 * it * t * cy + t * t * y1);
    }
    this.cables.strokePath();
  }

  /** Normalised 0..1 measure of how close the deck is to dumping its load. */
  static danger(sim: RigSim): number {
    return Phaser.Math.Clamp(Math.abs(sim.angle) / SIM.dumpAngle, 0, 1);
  }
}
