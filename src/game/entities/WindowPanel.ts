import Phaser from 'phaser';
import { CLEANING } from '../config';

export class WindowPanel {
  dirty = true;
  progressMs = 0;
  private dirtOverlay: Phaser.GameObjects.Rectangle;
  private sparkle: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    private scene: Phaser.Scene,
    public readonly x: number,
    public readonly y: number,
    public readonly width: number,
    public readonly height: number,
  ) {
    const base = scene.add.rectangle(x, y, width, height, 0x9ecdf4, 0.2).setStrokeStyle(2, 0x8ab5da, 0.6);
    base.setDepth(-4);
    this.dirtOverlay = scene.add.rectangle(x, y, width - 6, height - 6, 0x4f5f70, 0.9).setDepth(-3);

    this.sparkle = scene.add.particles(0, 0, 'spark', {
      speed: { min: 30, max: 90 },
      lifespan: 220,
      quantity: 0,
      scale: { start: 0.3, end: 0 },
      tint: 0xcff2ff,
    });
    this.sparkle.stop();
  }

  updateCleaning(isCleaning: boolean, cleanerX: number, cleanerY: number, deltaMs: number): boolean {
    if (!this.dirty || !isCleaning) return false;

    const inRange = Phaser.Math.Distance.Between(cleanerX, cleanerY, this.x, this.y) < CLEANING.range;
    if (!inRange) return false;

    this.progressMs += deltaMs;
    const alpha = Phaser.Math.Clamp(1 - this.progressMs / CLEANING.holdDurationMs, 0, 1);
    this.dirtOverlay.setAlpha(alpha * 0.9);
    this.sparkle.setPosition(cleanerX, cleanerY);
    this.sparkle.explode(5, cleanerX, cleanerY);

    if (this.progressMs >= CLEANING.holdDurationMs) {
      this.dirty = false;
      this.dirtOverlay.setVisible(false);
      return true;
    }

    return false;
  }
}
