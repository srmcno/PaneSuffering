import Phaser from 'phaser';
import { RunSummary } from '../types/GameTypes';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('gameover');
  }

  create(): void {
    const summary = this.registry.get('runSummary') as RunSummary;
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0d1222, 0.95);
    this.add.text(width / 2, 110, summary.result === 'win' ? 'SHIFT COMPLETE' : 'YOU GOT PANED', {
      fontFamily: 'Verdana',
      fontSize: '58px',
      color: summary.result === 'win' ? '#9ff2b2' : '#ff9d9d',
      stroke: '#000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    const lines = [
      `Score: ${summary.score}`,
      `Windows cleaned: ${summary.cleaned}/${summary.quota}`,
      `Set-piece survived: ${summary.survivedSetPiece ? 'Yes' : 'No'}`,
      `Time on rig: ${(summary.timeMs / 1000).toFixed(1)}s`,
      `Outcome: ${summary.reason}`,
    ];

    this.add.text(width / 2, 300, lines.join('\n'), {
      fontSize: '30px',
      fontFamily: 'monospace',
      color: '#e8eeff',
      align: 'center',
      lineSpacing: 12,
    }).setOrigin(0.5);

    const best = Math.max(summary.score, Number(localStorage.getItem('pane_best') || 0));
    localStorage.setItem('pane_best', String(best));
    this.add.text(width / 2, height - 170, `Best score: ${best}`, { fontSize: '26px', color: '#f4de9a' }).setOrigin(0.5);

    const cta = this.add.text(width / 2, height - 100, 'SPACE: Retry   |   T: Title', {
      fontSize: '28px',
      color: '#ffffff',
      backgroundColor: '#2c4570',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5);
    cta.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('game'));

    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('game'));
    this.input.keyboard?.once('keydown-T', () => this.scene.start('title'));
  }
}
