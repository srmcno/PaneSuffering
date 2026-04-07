import Phaser from 'phaser';
import { Rig } from '../Rig';

export class Pigeon {
  sprite: Phaser.Physics.Matter.Image;
  landed = false;
  expired = false;
  private lifeMs = 0;

  constructor(private scene: Phaser.Scene, private rig: Rig) {
    const spawnX = Phaser.Math.Between(480, 800);
    this.sprite = scene.matter.add
      .image(spawnX, -30, 'pigeon')
      .setCircle(9)
      .setBounce(0.2)
      .setFrictionAir(0.01)
      .setMass(0.6);
    this.sprite.setVelocity(Phaser.Math.FloatBetween(-1, 1), Phaser.Math.FloatBetween(2.5, 4));
  }

  update(deltaMs: number): void {
    this.lifeMs += deltaMs;
    if (!this.landed && Math.abs(this.sprite.y - (this.rig.body.y - 20)) < 12 && Math.abs(this.sprite.x - this.rig.body.x) < 160) {
      this.landed = true;
      this.sprite.setVelocity(0, 0);
      const perchX = this.rig.body.x + Phaser.Math.FloatBetween(-120, 120);
      this.sprite.setPosition(perchX, this.rig.body.y - 22);
    }

    if (this.landed) {
      const offset = this.sprite.x - this.rig.body.x;
      this.rig.body.applyForce({ x: offset * 0.00000065, y: 0 });
      if (Phaser.Math.Between(0, 200) < 2) {
        this.sprite.setVelocity(Phaser.Math.FloatBetween(-2, 2), -2);
      }
    }

    if (this.lifeMs > 12000 || this.sprite.y > 900) {
      this.expired = true;
      this.sprite.destroy();
    }
  }
}
