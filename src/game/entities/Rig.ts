import Phaser from 'phaser';

export class Rig {
  public readonly body: Phaser.Physics.Matter.Image;
  public stability = 1;
  public slipTimer = 0;

  private readonly leftAnchor: Phaser.Math.Vector2;
  private readonly rightAnchor: Phaser.Math.Vector2;

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    this.body = scene.matter.add.image(x, y, 'rig');
    this.body.setRectangle(260, 26);
    this.body.setMass(16);
    this.body.setFriction(0.7);
    this.body.setFrictionAir(0.025);
    this.body.setBounce(0.08);

    this.leftAnchor = new Phaser.Math.Vector2(x - 170, y - 250);
    this.rightAnchor = new Phaser.Math.Vector2(x + 170, y - 250);
  }

  update(deltaSec: number): void {
    const spring = 0.0018;
    const damping = 0.045;
    const leftPoint = this.body.getLeftCenter();
    const rightPoint = this.body.getRightCenter();
    const leftDx = this.leftAnchor.x - leftPoint.x;
    const rightDx = this.rightAnchor.x - rightPoint.x;
    const pull = (leftDx + rightDx) * spring;
    this.body.applyForce({ x: pull, y: 0 });
    this.body.setAngularVelocity(this.body.body.angularVelocity * (1 - damping * deltaSec));

    if (this.slipTimer > 0) {
      this.slipTimer -= deltaSec;
    }

    const angleStress = Math.min(1, Math.abs(this.body.rotation) / 0.7);
    const speedStress = Math.min(1, this.body.body.speed / 12);
    this.stability = Phaser.Math.Clamp(1 - (angleStress * 0.65 + speedStress * 0.35), 0, 1);
  }

  nudge(xForce: number, yForce = 0): void {
    this.body.applyForce({ x: xForce, y: yForce });
  }

  makeSlippery(durationSec: number): void {
    this.slipTimer = Math.max(this.slipTimer, durationSec);
  }

  drawRopes(g: Phaser.GameObjects.Graphics): void {
    const leftPoint = this.body.getLeftCenter();
    const rightPoint = this.body.getRightCenter();
    g.lineStyle(3, 0x94a3b8, 0.9);
    g.beginPath();
    g.moveTo(this.leftAnchor.x, this.leftAnchor.y);
    g.lineTo(leftPoint.x, leftPoint.y);
    g.moveTo(this.rightAnchor.x, this.rightAnchor.y);
    g.lineTo(rightPoint.x, rightPoint.y);
    g.strokePath();
  }
}
