import Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x111827);
    this.add.text(width / 2, height * 0.2, 'PANE & SUFFERING', {
      fontSize: '54px',
      color: '#fef3c7',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.34, 'Dark Slapstick Window-Washing Survival', {
      fontSize: '22px',
      color: '#cbd5e1',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.54, 260, 70, 0x2563eb).setInteractive({ useHandCursor: true });
    this.add.text(btn.x, btn.y, 'START SHIFT', { fontSize: '28px', color: '#f8fafc', fontStyle: 'bold' }).setOrigin(0.5);
    btn.on('pointerdown', () => {
      this.scene.start('GameScene');
      this.scene.launch('UIScene');
    });

    this.add.text(width / 2, height * 0.75, 'Controls: A/D move • Q/E lean • Space clean • S duck • Shift anchor • Esc pause', {
      fontSize: '18px',
      color: '#94a3b8',
      align: 'center',
      wordWrap: { width: width - 80 },
    }).setOrigin(0.5);
  }
}
