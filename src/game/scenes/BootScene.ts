import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.makeTexture('rig', 280, 28, 0xe7d9a5);
    this.makeTexture('player', 26, 30, 0xf2a65a);
    this.makeTexture('pigeon', 18, 18, 0xa5acbe);
    this.makeTexture('debris', 18, 18, 0x8b6f5c);
    this.makeTexture('poop', 12, 12, 0x6f4b2a);
    this.makeTexture('victim', 22, 34, 0xd77da8);
    this.makeTexture('spark', 6, 6, 0xffffff);
  }

  create(): void {
    this.scene.start('title');
  }

  private makeTexture(key: string, w: number, h: number, color: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, 4);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
