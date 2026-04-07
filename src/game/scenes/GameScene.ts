import Phaser from 'phaser';
import { CLEANING, COLORS } from '../config';
import { Player } from '../entities/Player';
import { Rig } from '../entities/Rig';
import { AudioSystem } from '../systems/AudioSystem';
import { HazardDirector } from '../systems/HazardDirector';
import { InputSystem } from '../systems/InputSystem';
import { LevelDirector } from '../systems/LevelDirector';
import { ScoreSystem } from '../systems/ScoreSystem';
import { RunSummary } from '../types/GameTypes';
import { UIScene } from './UIScene';

export class GameScene extends Phaser.Scene {
  private inputSystem!: InputSystem;
  private rig!: Rig;
  private player!: Player;
  private level!: LevelDirector;
  private score!: ScoreSystem;
  private audio!: AudioSystem;
  private hazards!: HazardDirector;
  private paused = false;
  private setPieceSurvived = false;

  constructor() {
    super('game');
  }

  create(): void {
    this.scene.launch('ui');
    const ui = this.scene.get('ui') as UIScene;

    this.drawBackdrop();

    this.inputSystem = new InputSystem(this);
    this.rig = new Rig(this, 640, 500);
    this.player = new Player(this, this.rig);
    this.level = new LevelDirector(this);
    this.score = new ScoreSystem();
    this.audio = new AudioSystem(this);

    this.hazards = new HazardDirector(this, this.rig, this.player, {
      onPlayerHit: (damage) => {
        this.player.takeHit(damage);
        this.score.penalizeHit();
        this.audio.playSfx('hit');
      },
      onHazardSurvived: () => this.score.addHazardSurvival(),
      onWarning: (text) => ui.showWarning(text),
      onSetPieceTriggered: () => this.audio.playSfx('glass_break'),
      onSetPieceSurvived: () => {
        this.setPieceSurvived = true;
        this.score.addSetPieceBonus();
        ui.showWarning('You survived the office-launch catastrophe!');
      },
    });
  }

  update(_time: number, delta: number): void {
    const ui = this.scene.get('ui') as UIScene;
    const intent = this.inputSystem.readIntent();

    if (intent.pausePressed) {
      this.paused = !this.paused;
      this.matter.world.enabled = !this.paused;
      ui.showPause(this.paused);
    }

    if (this.paused) return;

    this.player.update(intent, delta, this.hazards.isSlippery());

    let cleanedNow = 0;
    for (const panel of this.level.panels) {
      if (panel.updateCleaning(intent.cleanHeld, this.player.sprite.x, this.player.sprite.y - 18, delta)) {
        cleanedNow += 1;
      }
    }

    if (cleanedNow > 0) {
      this.score.addClean(cleanedNow * 120);
      this.audio.playSfx('clean');
    }

    this.hazards.update(delta);
    const rigFailed = this.rig.update(delta, this.player.isAnchorActive());
    this.score.tick(this.rig.stability, delta);

    ui.setHud({
      cleaned: this.level.cleanedCount(),
      quota: CLEANING.quota,
      score: this.score.score,
      health: this.player.health,
      stability: this.rig.stability,
      anchor: this.player.anchorRatio(),
    });

    if (this.player.isDead()) {
      this.endRun('fail', 'Knocked out of commission.');
      return;
    }

    if (rigFailed) {
      this.endRun('fail', 'Rig suffered catastrophic instability.');
      return;
    }

    if (this.level.cleanedCount() >= CLEANING.quota && this.hazards.hasFinishedLevel()) {
      this.endRun('win', 'Quota reached and shift survived.');
      return;
    }

    if (this.hazards.hasFinishedLevel() && this.level.cleanedCount() < CLEANING.quota) {
      this.endRun('fail', 'Shift ended before quota was met.');
    }
  }

  private endRun(result: 'win' | 'fail', reason: string): void {
    const total = this.score.finalize(this.level.cleanedCount(), CLEANING.quota, this.hazards.elapsedMs());
    const summary: RunSummary = {
      result,
      score: total,
      cleaned: this.level.cleanedCount(),
      quota: CLEANING.quota,
      survivedSetPiece: this.setPieceSurvived,
      timeMs: this.hazards.elapsedMs(),
      reason,
    };

    this.registry.set('runSummary', summary);
    this.scene.stop('ui');
    this.scene.start('gameover');
  }

  private drawBackdrop(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.bgTop, COLORS.bgTop, COLORS.bgBottom, COLORS.bgBottom, 1);
    bg.fillRect(0, 0, 1280, 720);

    const building = this.add.rectangle(640, 360, 620, 720, COLORS.building, 1);
    building.setDepth(-8);

    for (let y = 120; y <= 620; y += 120) {
      this.add.line(640, y, 330, 0, 950, 0, 0x3e4b70, 0.4).setDepth(-7);
    }

    this.add.rectangle(640, 700, 1280, 42, 0x0a0d15).setDepth(-1);
  }
}
