import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const g = this.add.graphics();

    g.fillStyle(0x64748b);
    g.fillRect(0, 0, 260, 26);
    g.generateTexture('rig', 260, 26);
    g.clear();

    g.fillStyle(0xfacc15);
    g.fillRect(0, 0, 28, 52);
    g.generateTexture('player', 28, 52);
    g.clear();

    g.fillStyle(0xb45309);
    g.fillCircle(10, 10, 10);
    g.generateTexture('debris', 20, 20);
    g.clear();

    g.fillStyle(0xe2e8f0);
    g.fillRect(0, 0, 26, 46);
    g.generateTexture('dummy', 26, 46);
    g.destroy();

    this.scene.start('TitleScene');
  }
}
