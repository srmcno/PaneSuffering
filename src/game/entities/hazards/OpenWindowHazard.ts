import Phaser from 'phaser';

export class OpenWindowHazard {
  panel: Phaser.GameObjects.Rectangle;
  active = true;
  expired = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.panel = scene.add.rectangle(x, y, 12, 80, 0x4e5d7f).setOrigin(0, 0.5);

    scene.tweens.add({
      targets: this.panel,
      scaleX: 8,
      duration: 220,
      yoyo: true,
      hold: 700,
      onComplete: () => {
        this.active = false;
        this.expired = true;
        this.panel.destroy();
      },
    });
  }

  intersects(x: number, y: number): boolean {
    const bounds = this.panel.getBounds();
    return this.active && Phaser.Geom.Rectangle.Contains(bounds, x, y);
  }
}
