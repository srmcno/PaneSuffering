import Phaser from 'phaser';
import { PLAYER } from '../config';
import { PlayerIntent } from '../types/GameTypes';
import { Rig } from './Rig';

export class Player {
  sprite: Phaser.Physics.Matter.Image;
  health = PLAYER.healthMax;
  staggerMs = 0;
  ducking = false;
  private anchorRemaining = 0;
  private anchorCooldown = 0;

  constructor(private scene: Phaser.Scene, private rig: Rig) {
    this.sprite = scene.matter.add
      .image(rig.body.x, rig.body.y - 28, 'player')
      .setCircle(12)
      .setBounce(0)
      .setFriction(0.02)
      .setMass(2.5);

    scene.matter.add.constraint(this.sprite.body as MatterJS.BodyType, rig.body.body as MatterJS.BodyType, 30, 0.9, {
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: -14 },
    });
  }

  update(intent: PlayerIntent, deltaMs: number, slippery: boolean): void {
    this.anchorCooldown = Math.max(0, this.anchorCooldown - deltaMs);
    this.anchorRemaining = Math.max(0, this.anchorRemaining - deltaMs);
    this.staggerMs = Math.max(0, this.staggerMs - deltaMs);

    if (intent.anchorPressed && this.anchorCooldown <= 0) {
      this.anchorRemaining = PLAYER.anchorDurationMs;
      this.anchorCooldown = PLAYER.anchorCooldownMs;
    }

    if (this.staggerMs <= 0) {
      const moveMultiplier = slippery ? 0.42 : 1;
      const forceX = intent.move * PLAYER.moveForce * moveMultiplier;
      this.sprite.applyForce({ x: forceX, y: 0 });

      if (Math.abs(this.sprite.body.velocity.x) > PLAYER.maxSpeed) {
        this.sprite.setVelocityX(Math.sign(this.sprite.body.velocity.x) * PLAYER.maxSpeed);
      }

      if (intent.lean !== 0) {
        this.rig.body.applyForce({ x: intent.lean * 0.00045, y: 0 });
        this.rig.body.setAngularVelocity(this.rig.body.body.angularVelocity + intent.lean * PLAYER.leanTorque);
      }
    }

    this.ducking = intent.duckHeld;
    this.sprite.setScale(1, this.ducking ? PLAYER.duckScaleY : 1);
  }

  isAnchorActive(): boolean {
    return this.anchorRemaining > 0;
  }

  anchorRatio(): number {
    return this.anchorCooldown <= 0 ? 1 : 1 - this.anchorCooldown / PLAYER.anchorCooldownMs;
  }

  takeHit(amount: number): void {
    if (this.isAnchorActive()) {
      amount *= 0.5;
    }
    this.health = Math.max(0, this.health - amount);
    this.staggerMs = 300;
    this.scene.cameras.main.shake(120, 0.004);
  }

  isDead(): boolean {
    return this.health <= 0 || this.sprite.y > 880;
  }
}
