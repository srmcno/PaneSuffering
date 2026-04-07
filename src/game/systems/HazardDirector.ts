import Phaser from 'phaser';
import { HAZARDS } from '../config';
import { Player } from '../entities/Player';
import { Rig } from '../entities/Rig';
import { Debris } from '../entities/hazards/Debris';
import { OpenWindowHazard } from '../entities/hazards/OpenWindowHazard';
import { Pigeon } from '../entities/hazards/Pigeon';
import { PoopSplat } from '../entities/hazards/PoopSplat';
import { SetPieceVictim } from '../entities/hazards/SetPieceVictim';

interface HazardCallbacks {
  onPlayerHit: (damage: number) => void;
  onHazardSurvived: () => void;
  onWarning: (text: string) => void;
  onSetPieceTriggered: () => void;
  onSetPieceSurvived: () => void;
}

export class HazardDirector {
  private pigeons: Pigeon[] = [];
  private debris: Debris[] = [];
  private windows: OpenWindowHazard[] = [];
  private poop: PoopSplat[] = [];
  private victims: SetPieceVictim[] = [];

  private elapsed = 0;
  private nextPigeon = 0;
  private nextPoop = 0;
  private nextWind = 0;
  private nextWindow = 0;
  private nextDebris = 0;

  private slipperyUntil = 0;
  private setPieceWarningShown = false;
  private setPieceTriggered = false;
  private setPieceSurvivalUntil = 0;

  constructor(
    private scene: Phaser.Scene,
    private rig: Rig,
    private player: Player,
    private callbacks: HazardCallbacks,
  ) {
    this.rollTimers();
  }

  private rollTimers(): void {
    this.nextPigeon = Phaser.Math.Between(...HAZARDS.pigeonInterval);
    this.nextPoop = Phaser.Math.Between(...HAZARDS.poopInterval);
    this.nextWind = Phaser.Math.Between(...HAZARDS.windInterval);
    this.nextWindow = Phaser.Math.Between(...HAZARDS.windowInterval);
    this.nextDebris = Phaser.Math.Between(...HAZARDS.debrisInterval);
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs;

    this.nextPigeon -= deltaMs;
    this.nextPoop -= deltaMs;
    this.nextWind -= deltaMs;
    this.nextWindow -= deltaMs;
    this.nextDebris -= deltaMs;

    if (this.nextPigeon <= 0) {
      this.pigeons.push(new Pigeon(this.scene, this.rig));
      this.nextPigeon = Phaser.Math.Between(2200, 6200);
    }

    if (this.nextPoop <= 0) {
      this.poop.push(new PoopSplat(this.scene, Phaser.Math.Between(500, 830), 20));
      this.nextPoop = Phaser.Math.Between(4200, 7800);
    }

    if (this.nextWind <= 0) {
      const force = Phaser.Math.FloatBetween(-0.014, 0.014);
      this.rig.applyWind(force);
      this.callbacks.onWarning(force > 0 ? 'Wind gust from left!' : 'Wind gust from right!');
      this.nextWind = Phaser.Math.Between(4800, 9800);
      this.callbacks.onHazardSurvived();
    }

    if (this.nextWindow <= 0) {
      const openY = Phaser.Math.Between(160, 560);
      this.windows.push(new OpenWindowHazard(this.scene, 385, openY));
      this.nextWindow = Phaser.Math.Between(6200, 10200);
    }

    if (this.nextDebris <= 0) {
      this.debris.push(new Debris(this.scene, Phaser.Math.Between(500, 830), 15));
      this.nextDebris = Phaser.Math.Between(3600, 7600);
    }

    if (!this.setPieceWarningShown && this.elapsed > HAZARDS.setPieceAtMs - 2600) {
      this.setPieceWarningShown = true;
      this.callbacks.onWarning('Muffled shouting from office floor 6...');
    }

    if (!this.setPieceTriggered && this.elapsed >= HAZARDS.setPieceAtMs) {
      this.triggerSetPiece();
    }

    this.pigeons.forEach((p) => p.update(deltaMs));
    this.debris.forEach((d) => d.update());
    this.poop.forEach((p) => p.update());
    this.victims.forEach((v) => v.update());

    this.cleanup();
    this.handleHits();

    if (this.setPieceTriggered && this.elapsed > this.setPieceSurvivalUntil && this.setPieceSurvivalUntil > 0) {
      this.callbacks.onSetPieceSurvived();
      this.setPieceSurvivalUntil = 0;
    }
  }

  private triggerSetPiece(): void {
    this.setPieceTriggered = true;
    this.callbacks.onSetPieceTriggered();
    this.callbacks.onWarning('CRACK! Incoming office worker!');

    for (let i = 0; i < 5; i += 1) {
      this.debris.push(new Debris(this.scene, 420 + i * 16, 280 + i * 2));
    }
    this.victims.push(new SetPieceVictim(this.scene, 450, 280));
    this.rig.slam(0.06);
    this.scene.cameras.main.shake(420, 0.012);
    this.setPieceSurvivalUntil = this.elapsed + 9000;
  }

  private handleHits(): void {
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;

    this.debris.forEach((d) => {
      if (!d.expired && Phaser.Math.Distance.Between(px, py, d.sprite.x, d.sprite.y) < 20) {
        d.expired = true;
        d.sprite.destroy();
        this.callbacks.onPlayerHit(15);
      }
    });

    this.poop.forEach((p) => {
      if (!p.expired && Phaser.Math.Distance.Between(px, py, p.projectile.x, p.projectile.y) < 18) {
        this.slipperyUntil = this.elapsed + 4000;
        p.expired = true;
        p.projectile.destroy();
        this.callbacks.onWarning('Slippery platform!');
        this.callbacks.onPlayerHit(6);
      }
    });

    this.victims.forEach((v) => {
      if (!v.expired && Phaser.Math.Distance.Between(px, py, v.sprite.x, v.sprite.y) < 30) {
        this.callbacks.onPlayerHit(26);
      }
      if (!v.expired && Phaser.Math.Distance.Between(this.rig.body.x, this.rig.body.y, v.sprite.x, v.sprite.y) < 52) {
        this.rig.slam(0.04);
      }
    });

    this.windows.forEach((w) => {
      if (w.intersects(px, py) && !this.player.ducking) {
        this.callbacks.onPlayerHit(12);
      }
      if (w.intersects(this.rig.body.x - 40, this.rig.body.y)) {
        this.rig.slam(0.018);
      }
    });
  }

  private cleanup(): void {
    this.pigeons = this.pigeons.filter((x) => !x.expired);
    this.debris = this.debris.filter((x) => !x.expired);
    this.poop = this.poop.filter((x) => !x.expired);
    this.windows = this.windows.filter((x) => !x.expired);
    this.victims = this.victims.filter((x) => !x.expired);
  }

  isSlippery(): boolean {
    return this.elapsed < this.slipperyUntil;
  }

  isSetPieceTriggered(): boolean {
    return this.setPieceTriggered;
  }

  hasFinishedLevel(): boolean {
    return this.elapsed >= HAZARDS.levelLengthMs;
  }

  elapsedMs(): number {
    return this.elapsed;
  }
}
