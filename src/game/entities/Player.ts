import Phaser from 'phaser';
import { InputIntent } from '../types/GameTypes';
import { Rig } from './Rig';

export class Player {
  public readonly body: Phaser.Physics.Matter.Image;
  public health = 100;
  public cleanPower = 0;
  public anchorCooldown = 0;
  public staggerTime = 0;
  private ducking = false;

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    this.body = scene.matter.add.image(x, y, 'player');
    this.body.setRectangle(28, 52);
    this.body.setFriction(0.06);
    this.body.setFrictionAir(0.03);
    this.body.setBounce(0.02);
    this.body.setMass(4);
  }

  update(intent: InputIntent, rig: Rig, deltaSec: number): void {
    this.anchorCooldown = Math.max(0, this.anchorCooldown - deltaSec);
    this.staggerTime = Math.max(0, this.staggerTime - deltaSec);

    const surfaceGrip = rig.slipTimer > 0 ? 0.0025 : 0.006;
    const moveForce = intent.move * (this.ducking ? 0.0018 : 0.0034);
    if (this.staggerTime <= 0) {
      this.body.applyForce({ x: moveForce * surfaceGrip * 110, y: 0 });
    }

    rig.nudge(intent.lean * 0.00033);

    if (intent.anchorPressed && this.anchorCooldown <= 0) {
      this.anchorCooldown = 7;
      rig.body.setVelocity(rig.body.body.velocity.x * 0.2, rig.body.body.velocity.y * 0.2);
      rig.body.setAngularVelocity(rig.body.body.angularVelocity * 0.12);
      this.scene.cameras.main.flash(120, 160, 220, 255, false);
    }

    this.ducking = intent.duckHeld;
    this.body.setScale(1, this.ducking ? 0.7 : 1);

    this.cleanPower = intent.cleanHeld ? Math.min(1, this.cleanPower + deltaSec * 5) : 0;
  }

  hurt(amount: number): void {
    this.health = Math.max(0, this.health - amount);
    this.staggerTime = 0.45;
  }

  get isDucking(): boolean {
    return this.ducking;
  }
}
