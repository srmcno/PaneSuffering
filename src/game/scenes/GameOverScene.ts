import Phaser from 'phaser';
import { RunSummary } from '../types/GameTypes';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  init(data: RunSummary): void {
    this.registry.set('summary', data);
  }

  create(): void {
    const summary = this.registry.get('summary') as RunSummary;
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x020617, 0.96);
    this.add.text(width / 2, height * 0.16, summary.win ? 'SHIFT COMPLETE' : 'SHIFT FAILED', {
      fontSize: '52px',
      color: summary.win ? '#86efac' : '#fca5a5',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const lines = [
      `Score: ${summary.score}`,
      `Windows cleaned: ${summary.cleaned}/${summary.quota}`,
      `Time on rig: ${summary.timeSeconds.toFixed(1)}s`,
      `Set-piece survived: ${summary.survivedSetPiece ? 'Yes (+bonus)' : 'No'}`,
      `Result: ${summary.reason}`,
    ];
    this.add.text(width / 2, height * 0.42, lines, {
      fontSize: '24px',
      color: '#e2e8f0',
      align: 'center',
      lineSpacing: 12,
    }).setOrigin(0.5);

    const restart = this.add.rectangle(width / 2, height * 0.72, 300, 72, 0x2563eb).setInteractive({ useHandCursor: true });
    this.add.text(restart.x, restart.y, 'RESTART SHIFT', { fontSize: '28px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);

    restart.on('pointerdown', () => {
      this.scene.stop('UIScene');
      this.scene.start('TitleScene');
    });
  }
}
