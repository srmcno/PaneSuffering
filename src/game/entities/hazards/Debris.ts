import Phaser from 'phaser';

export class Debris {
  sprite: Phaser.Physics.Matter.Image;
  expired = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.matter.add
      .image(x, y, 'debris')
      .setRectangle(18, 18)
      .setMass(1.2)
      .setBounce(0.35)
      .setFrictionAir(0.002);
    this.sprite.setVelocity(Phaser.Math.FloatBetween(-1, 1), Phaser.Math.FloatBetween(2, 5));
  }

  update(): void {
    if (this.sprite.y > 980) {
      this.expired = true;
      this.sprite.destroy();
    }
  }
}
