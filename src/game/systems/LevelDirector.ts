import Phaser from 'phaser';
import { WindowPanel } from '../entities/WindowPanel';

export class LevelDirector {
  panels: WindowPanel[] = [];

  constructor(private scene: Phaser.Scene) {
    const cols = 3;
    const rows = 4;
    const startX = 520;
    const startY = 180;
    const spacingX = 130;
    const spacingY = 120;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        this.panels.push(new WindowPanel(scene, startX + c * spacingX, startY + r * spacingY, 100, 85));
      }
    }
  }

  getDirtyCount(): number {
    return this.panels.filter((p) => p.dirty).length;
  }

  cleanedCount(): number {
    return this.panels.length - this.getDirtyCount();
  }
}
