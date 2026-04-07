import Phaser from 'phaser';

export class PoopSplat {
  projectile: Phaser.Physics.Matter.Image;
  expired = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.projectile = scene.matter.add
      .image(x, y, 'poop')
      .setCircle(6)
      .setMass(0.3)
      .setFrictionAir(0.005);
    this.projectile.setVelocity(Phaser.Math.FloatBetween(-1, 1), Phaser.Math.FloatBetween(2, 3));
  }

  update(): void {
    if (this.projectile.y > 850) {
      this.expired = true;
      this.projectile.destroy();
    }
  }
}
