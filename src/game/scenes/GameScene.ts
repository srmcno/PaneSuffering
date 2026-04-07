import Phaser from 'phaser';
import { WINDOW_COLUMNS, WINDOW_ROWS } from '../config';
import { Player } from '../entities/Player';
import { Rig } from '../entities/Rig';
import { WindowPanel } from '../entities/WindowPanel';
import { AudioSystem } from '../systems/AudioSystem';
import { HazardDirector } from '../systems/HazardDirector';
import { InputSystem } from '../systems/InputSystem';
import { LevelDirector } from '../systems/LevelDirector';
import { ScoreSystem } from '../systems/ScoreSystem';

export class GameScene extends Phaser.Scene {
  private inputSystem!: InputSystem;
  private player!: Player;
  private rig!: Rig;
  private windows: WindowPanel[] = [];
  private ropeGraphics!: Phaser.GameObjects.Graphics;
  private level = new LevelDirector();
  private score = new ScoreSystem();
  private audio!: AudioSystem;
  private hazards!: HazardDirector;

  private cleanedCount = 0;
  private quota = 0;
  private paused = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.matter.world.setBounds(130, -500, 940, 2600, 64, true, true, false, true);
    this.createBackdrop();

    this.rig = new Rig(this, this.scale.width / 2, this.scale.height * 0.72);
    this.player = new Player(this, this.rig.body.x, this.rig.body.y - 52);
    this.player.body.setIgnoreGravity(false);
    this.player.body.setFixedRotation();

    const constraint = this.matter.add.constraint(this.rig.body.body as MatterJS.BodyType, this.player.body.body as MatterJS.BodyType, 62, 0.82, {
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: 30 },
    });
    void constraint;

    this.createWindows();
    this.inputSystem = new InputSystem(this);
    this.audio = new AudioSystem(this);
    this.hazards = new HazardDirector(this, this.level, this.rig, this.player);
    this.ropeGraphics = this.add.graphics();

    this.cameras.main.setBounds(0, 0, this.scale.width, this.scale.height);
    this.events.on('shutdown', () => this.windows.forEach((w) => w.destroy()));
  }

  update(_: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const intent = this.inputSystem.getIntent();

    if (intent.pausePressed) {
      this.paused = !this.paused;
      this.game.events.emit('hud:pause', this.paused);
    }
    if (this.paused) return;

    this.level.update(dt);
    this.rig.update(dt);
    this.player.update(intent, this.rig, dt);
    this.player.body.setPosition(this.player.body.x, this.rig.body.y - 52);

    if (Math.abs(this.rig.body.rotation) > 0.55) {
      this.score.penalizeInstability();
    }

    if (intent.cleanHeld) {
      this.tryCleaning(dt);
    }

    const hits = this.hazards.update(dt);
    if (hits > 0) {
      for (let i = 0; i < hits; i++) this.score.penalizeHit();
      this.audio.play('debris');
    }

    this.applyFailChecks();
    this.applyWinCheck();

    this.score.addTickEfficiency(dt);
    this.drawRopesAndHud();
  }

  private createBackdrop(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(w / 2, h / 2, w, h, 0x0f172a);
    this.add.rectangle(140, h / 2, 260, h, 0x1e293b, 0.8);
    this.add.rectangle(w - 140, h / 2, 260, h, 0x1e293b, 0.8);
    this.add.rectangle(w / 2, h / 2, w - 320, h, 0x111827, 0.95);
    this.add.text(w / 2, 34, 'Tower Face C-17', { fontSize: '20px', color: '#64748b' }).setOrigin(0.5);
  }

  private createWindows(): void {
    const startX = this.scale.width / 2 - 260;
    const startY = 180;
    const xGap = 176;
    const yGap = 155;
    for (let row = 0; row < WINDOW_ROWS; row++) {
      for (let col = 0; col < WINDOW_COLUMNS; col++) {
        const x = startX + col * xGap;
        const y = startY + row * yGap;
        this.windows.push(new WindowPanel(this, x, y));
      }
    }
    this.quota = Math.floor(this.windows.length * 0.7);
  }

  private tryCleaning(dt: number): void {
    const cleanRadius = 140;
    for (const panel of this.windows) {
      if (panel.cleaned) continue;
      const centerX = panel.bounds.centerX;
      const centerY = panel.bounds.centerY;
      const distance = Phaser.Math.Distance.Between(this.player.body.x, this.player.body.y - 40, centerX, centerY);
      if (distance < cleanRadius) {
        const justCleaned = panel.applyClean(dt * (0.9 + this.player.cleanPower * 1.2));
        if (justCleaned) {
          this.cleanedCount += 1;
          this.score.addClean();
          this.audio.play('clean');
          this.cameras.main.shake(60, 0.0014);
        }
      }
    }
  }

  private applyFailChecks(): void {
    if (this.player.health <= 0) {
      this.endRun(false, 'Too many workplace injuries.');
      return;
    }
    if (Math.abs(this.rig.body.rotation) > 1.1) {
      this.endRun(false, 'Catastrophic rig instability.');
      return;
    }
    if (this.player.body.y > this.scale.height + 120) {
      this.endRun(false, 'You fell from the platform.');
    }
  }

  private applyWinCheck(): void {
    if (this.cleanedCount >= this.quota && this.level.elapsed > 35) {
      if (this.hazards.survivedSetPiece) {
        this.score.addMajorBonus();
      }
      this.endRun(true, 'Quota reached and shift survived.');
    }
  }

  private drawRopesAndHud(): void {
    this.ropeGraphics.clear();
    this.rig.drawRopes(this.ropeGraphics);

    this.game.events.emit('hud:update', {
      score: this.score.getValue(),
      health: this.player.health,
      cleaned: this.cleanedCount,
      quota: this.quota,
      stability: this.rig.stability,
      anchorCooldown: this.player.anchorCooldown,
      warning: this.hazards.warningText,
    });
  }

  private endRun(win: boolean, reason: string): void {
    this.scene.stop('UIScene');
    this.scene.start('GameOverScene', {
      win,
      score: this.score.getValue(),
      cleaned: this.cleanedCount,
      quota: this.quota,
      timeSeconds: this.level.elapsed,
      survivedSetPiece: this.hazards.survivedSetPiece,
      reason,
    });
  }
}
