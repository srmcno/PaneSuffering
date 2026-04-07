import Phaser from 'phaser';
import { PHYSICS } from '../config';

export class Rig {
  body: Phaser.Physics.Matter.Image;
  leftAnchor: Phaser.Physics.Matter.Image;
  rightAnchor: Phaser.Physics.Matter.Image;
  stability = 1;
  criticalTime = 0;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.leftAnchor = scene.matter.add.image(x - 150, 70, '__WHITE').setDisplaySize(16, 16).setStatic(true).setVisible(false);
    this.rightAnchor = scene.matter.add.image(x + 150, 70, '__WHITE').setDisplaySize(16, 16).setStatic(true).setVisible(false);

    this.body = scene.matter.add
      .image(x, y, 'rig')
      .setRectangle(280, 28)
      .setFriction(0.06)
      .setFrictionAir(PHYSICS.rigDamping)
      .setMass(20);

    const matterWorld = scene.matter.world;
    const constraintA = matterWorld.nextConstraintId();
    const constraintB = matterWorld.nextConstraintId();

    // @ts-expect-error Phaser Matter constraint config typing misses some fields
    matterWorld.addConstraint(this.body.body, this.leftAnchor.body, 170, PHYSICS.rigStiffness, {
      pointA: { x: -120, y: -10 },
      pointB: { x: 0, y: 0 },
      id: constraintA,
    });
    // @ts-expect-error Phaser Matter constraint config typing misses some fields
    matterWorld.addConstraint(this.body.body, this.rightAnchor.body, 170, PHYSICS.rigStiffness, {
      pointA: { x: 120, y: -10 },
      pointB: { x: 0, y: 0 },
      id: constraintB,
    });

    const rope = scene.add.graphics();
    rope.setDepth(-2);
    scene.events.on('update', () => {
      rope.clear();
      rope.lineStyle(4, 0xb9bcc6, 1);
      rope.beginPath();
      rope.moveTo(this.leftAnchor.x, this.leftAnchor.y);
      rope.lineTo(this.body.x - 120, this.body.y - 14);
      rope.moveTo(this.rightAnchor.x, this.rightAnchor.y);
      rope.lineTo(this.body.x + 120, this.body.y - 14);
      rope.strokePath();
    });
  }

  update(deltaMs: number, anchorActive: boolean): boolean {
    const angleRisk = Math.abs(this.body.rotation) / PHYSICS.maxRigAngleForFailure;
    const velRisk = Math.min(1, Math.abs(this.body.body.angularVelocity) * 8);
    const posRisk = Math.min(1, Math.abs(this.body.x - 640) / 280);
    const rawRisk = Math.max(angleRisk, velRisk * 0.75 + posRisk * 0.25);

    this.stability = Phaser.Math.Clamp(1 - rawRisk + (anchorActive ? 0.25 : 0), 0, 1);

    if (this.stability < 0.15) {
      this.criticalTime += deltaMs;
    } else {
      this.criticalTime = Math.max(0, this.criticalTime - deltaMs * 1.7);
    }

    return this.criticalTime > PHYSICS.criticalInstabilityMs;
  }

  applyWind(forceX: number): void {
    this.body.applyForce({ x: forceX, y: 0 });
  }

  slam(amount: number): void {
    this.body.applyForce({ x: Phaser.Math.FloatBetween(-amount, amount), y: amount * 0.2 });
    this.body.setAngularVelocity(this.body.body.angularVelocity + Phaser.Math.FloatBetween(-0.08, 0.08));
  }
}
