import Phaser from 'phaser';

export class WindowPanel {
  public progress = 0;
  public cleaned = false;
  public readonly bounds: Phaser.Geom.Rectangle;

  private readonly frame: Phaser.GameObjects.Rectangle;
  private readonly grime: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, width = 180, height = 120) {
    this.bounds = new Phaser.Geom.Rectangle(x - width / 2, y - height / 2, width, height);
    this.frame = scene.add.rectangle(x, y, width, height, 0x334155).setStrokeStyle(2, 0x94a3b8);
    this.grime = scene.add.rectangle(x, y, width - 14, height - 14, 0x1e293b, 0.82);
  }

  applyClean(amount: number): boolean {
    if (this.cleaned) return false;
    this.progress = Phaser.Math.Clamp(this.progress + amount, 0, 1);
    const alpha = Phaser.Math.Linear(0.82, 0.12, this.progress);
    this.grime.setAlpha(alpha);
    if (this.progress >= 1) {
      this.cleaned = true;
      this.frame.setFillStyle(0x3b82f6, 0.25);
      return true;
    }
    return false;
  }

  destroy(): void {
    this.frame.destroy();
    this.grime.destroy();
  }
}
