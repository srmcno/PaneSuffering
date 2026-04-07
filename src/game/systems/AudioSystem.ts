import Phaser from 'phaser';

export class AudioSystem {
  constructor(private readonly scene: Phaser.Scene) {}

  play(name: 'clean' | 'pigeon' | 'glass' | 'debris' | 'wind' | 'warning' | 'success' | 'fail'): void {
    void this.scene;
    console.debug(`[audio-hook] ${name}`);
  }
}
