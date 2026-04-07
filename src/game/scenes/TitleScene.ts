import Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    const { width, height } = this.scale;
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x131a30);
    bg.setAlpha(0.98);

    this.add.text(width / 2, 150, 'PANE & SUFFERING', {
      fontFamily: 'Verdana',
      fontSize: '64px',
      color: '#f4dd9a',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(width / 2, 260, 'Dark slapstick window-washing survival.', {
      fontFamily: 'Verdana',
      fontSize: '24px',
      color: '#c2d7ff',
    }).setOrigin(0.5);

    const controls = [
      'A/D or ←/→ Move on rig',
      'Q/E Lean for balance',
      'SPACE / Left Mouse Clean',
      'S or CTRL Duck',
      'SHIFT / Right Mouse Emergency Anchor',
      'ESC Pause',
    ];

    this.add.text(width / 2, 380, controls.join('\n'), {
      fontFamily: 'monospace',
      fontSize: '21px',
      color: '#f2f5ff',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);

    const start = this.add.text(width / 2, height - 120, '▶ START SHIFT', {
      fontFamily: 'Verdana',
      fontSize: '34px',
      backgroundColor: '#2f5f99',
      color: '#ffffff',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    start.on('pointerdown', () => this.scene.start('game'));
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('game'));
  }
}
