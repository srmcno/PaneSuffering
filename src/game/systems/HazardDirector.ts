import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Rig } from '../entities/Rig';
import { Debris } from '../hazards/Debris';
import { OpenWindowHazard } from '../hazards/OpenWindowHazard';
import { Pigeon } from '../hazards/Pigeon';
import { LevelDirector } from './LevelDirector';

export class HazardDirector {
  private pigeons: Pigeon[] = [];
  private debris: Debris[] = [];
  private openWindows: OpenWindowHazard[] = [];
  private spawnTimer = 0;
  public warningText = '';
  public survivedSetPiece = false;
  private setPieceState: 'idle' | 'warning' | 'impact' | 'recover' = 'idle';
  private setPieceTimer = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly level: LevelDirector, private readonly rig: Rig, private readonly player: Player) {}

  update(deltaSec: number): number {
    this.spawnTimer -= deltaSec;
    let hits = 0;

    if (this.spawnTimer <= 0) {
      this.spawnRoutine();
      this.spawnTimer = Phaser.Math.Between(2, 5) - this.level.phase * 0.45;
    }

    this.pigeons = this.pigeons.filter((p) => {
      p.update(deltaSec);
      return p.alive;
    });

    this.debris = this.debris.filter((d) => {
      d.update();
      if (!d.alive) return false;
      const dist = Phaser.Math.Distance.Between(d.body.x, d.body.y, this.player.body.x, this.player.body.y);
      if (dist < 34 && !this.player.isDucking) {
        this.player.hurt(12);
        hits += 1;
        d.alive = false;
        d.body.destroy();
        return false;
      }
      const rigDist = Phaser.Math.Distance.Between(d.body.x, d.body.y, this.rig.body.x, this.rig.body.y);
      if (rigDist < 130) {
        this.rig.nudge((d.body.x > this.rig.body.x ? 1 : -1) * 0.0012, -0.0007);
      }
      return true;
    });

    this.openWindows = this.openWindows.filter((w) => {
      const gotHit = w.update(deltaSec, this.player);
      if (gotHit) hits += 1;
      return w.alive;
    });

    this.updateSetPiece(deltaSec);
    return hits;
  }

  private spawnRoutine(): void {
    const roll = Math.random();
    if (roll < 0.22 + this.level.phase * 0.04) {
      this.pigeons.push(new Pigeon(this.scene, this.rig));
    } else if (roll < 0.5) {
      this.debris.push(new Debris(this.scene, Phaser.Math.Between(330, 970), this.rig.body.y - 460));
    } else if (roll < 0.72) {
      const side: -1 | 1 = Math.random() > 0.5 ? 1 : -1;
      const x = side === 1 ? 1000 : 200;
      const y = Phaser.Math.Between(this.rig.body.y - 180, this.rig.body.y + 80);
      this.openWindows.push(new OpenWindowHazard(this.scene, x, y, side));
    } else if (roll < 0.88) {
      // wind gust
      const dir = Math.random() > 0.5 ? 1 : -1;
      this.rig.nudge(dir * (0.0012 + this.level.phase * 0.0007));
      this.warningText = 'WIND GUST!';
      this.scene.time.delayedCall(700, () => (this.warningText = ''));
    } else {
      // poop splat => slippery platform
      this.rig.makeSlippery(3.5);
      this.warningText = 'BIRD POOP: SLIPPERY RIG';
      this.scene.time.delayedCall(900, () => (this.warningText = ''));
    }
  }

  private updateSetPiece(deltaSec: number): void {
    if (this.level.shouldTriggerSetPiece() && this.setPieceState === 'idle') {
      this.setPieceState = 'warning';
      this.setPieceTimer = 2.4;
      this.warningText = 'Muffled screaming... window cracking!';
    }

    if (this.setPieceState === 'idle') return;

    this.setPieceTimer -= deltaSec;
    if (this.setPieceState === 'warning' && this.setPieceTimer <= 0) {
      this.setPieceState = 'impact';
      this.setPieceTimer = 0.1;
      const human = this.scene.matter.add.image(this.rig.body.x + 340, this.rig.body.y - 260, 'dummy');
      human.setRectangle(26, 46);
      human.setMass(7);
      human.setVelocity(-14, 7);
      this.rig.nudge(-0.012, -0.004);
      this.scene.cameras.main.shake(300, 0.01);
      this.warningText = 'SET-PIECE: SURVIVE THE AFTERMATH!';
      this.scene.time.delayedCall(1500, () => human.destroy());
    } else if (this.setPieceState === 'impact' && this.setPieceTimer <= 0) {
      this.setPieceState = 'recover';
      this.setPieceTimer = 6;
      for (let i = 0; i < 8; i++) {
        this.debris.push(new Debris(this.scene, this.rig.body.x + Phaser.Math.Between(-150, 150), this.rig.body.y - 240));
      }
    } else if (this.setPieceState === 'recover' && this.setPieceTimer <= 0) {
      this.setPieceState = 'idle';
      this.warningText = '';
      this.survivedSetPiece = true;
    }
  }
}
