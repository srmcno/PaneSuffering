import Phaser from 'phaser';

export class Debris {
  public readonly body: Phaser.Physics.Matter.Image;
  public alive = true;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.body = scene.matter.add.image(x, y, 'debris');
    this.body.setCircle(10);
    this.body.setMass(2.5);
    this.body.setFriction(0.1);
    this.body.setBounce(0.3);
  }

  update(): void {
    if (this.body.y > 2600) {
      this.alive = false;
      this.body.destroy();
    }
  }
}
