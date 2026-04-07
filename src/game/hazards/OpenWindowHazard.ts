import Phaser from 'phaser';
import { Player } from '../entities/Player';

export class OpenWindowHazard {
  private readonly panel: Phaser.GameObjects.Rectangle;
  private t = 0;
  public alive = true;

  constructor(private readonly scene: Phaser.Scene, private readonly x: number, private readonly y: number, private readonly facing: -1 | 1) {
    this.panel = scene.add.rectangle(x, y, 14, 90, 0xf59e0b).setOrigin(facing === 1 ? 0 : 1, 0.5).setDepth(4);
  }

  update(deltaSec: number, player: Player): boolean {
    this.t += deltaSec;
    const openAmount = Math.sin(Math.min(this.t * 4.4, Math.PI));
    this.panel.scaleX = 1 + openAmount * 5;

    const hitRange = new Phaser.Geom.Rectangle(this.x - 45, this.y - 50, 90, 100);
    if (openAmount > 0.8 && Phaser.Geom.Rectangle.Contains(hitRange, player.body.x, player.body.y) && !player.isDucking) {
      player.hurt(8);
      this.scene.cameras.main.shake(110, 0.004);
      this.alive = false;
      this.panel.destroy();
      return true;
    }

    if (this.t > 1.2) {
      this.alive = false;
      this.panel.destroy();
    }
    return false;
  }
}
