import Phaser from 'phaser';

export class SetPieceVictim {
  sprite: Phaser.Physics.Matter.Image;
  expired = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.matter.add
      .image(x, y, 'victim')
      .setRectangle(20, 34)
      .setMass(4)
      .setBounce(0.2)
      .setFrictionAir(0.002);
    this.sprite.setVelocity(Phaser.Math.FloatBetween(-6, -4), Phaser.Math.FloatBetween(-1, 1));
    this.sprite.setAngularVelocity(0.15);
  }

  update(): void {
    if (this.sprite.y > 900 || this.sprite.x < 120) {
      this.expired = true;
      this.sprite.destroy();
    }
  }
}
