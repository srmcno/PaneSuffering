import Phaser from 'phaser';
import { Rig } from '../entities/Rig';

export class Pigeon {
  public readonly sprite: Phaser.GameObjects.Ellipse;
  public alive = true;
  private landingSide: -1 | 1;
  private timer = 2.8;

  constructor(private readonly scene: Phaser.Scene, private readonly rig: Rig) {
    this.landingSide = Math.random() > 0.5 ? 1 : -1;
    this.sprite = scene.add.ellipse(0, 0, 20, 14, 0x94a3b8).setDepth(5);
  }

  update(deltaSec: number): void {
    this.timer -= deltaSec;
    const targetX = this.rig.body.x + this.landingSide * 120;
    const hoverY = this.rig.body.y - 28;
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, targetX, 0.1);
    this.sprite.y = Phaser.Math.Linear(this.sprite.y || hoverY - 80, hoverY, 0.08);
    this.rig.nudge(this.landingSide * 0.00006);

    if (this.timer < 1.3 && Math.random() < 0.02) {
      this.rig.nudge(this.landingSide * 0.0012, -0.0003);
    }

    if (this.timer <= 0) {
      this.alive = false;
      this.sprite.destroy();
    }
  }
}
