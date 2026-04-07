import Phaser from 'phaser';

export class AudioSystem {
  constructor(private scene: Phaser.Scene) {}

  playSfx(key: string): void {
    // Placeholder hook for real audio assets.
    // Future: scene.sound.play(key)
    if (this.scene.registry.get('audioDebug')) {
      // eslint-disable-next-line no-console
      console.log(`[SFX] ${key}`);
    }
  }
}
