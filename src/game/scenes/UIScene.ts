import Phaser from 'phaser';
import { GameHudState } from '../types/GameTypes';

export class UIScene extends Phaser.Scene {
  private hudText?: Phaser.GameObjects.Text;
  private warningText?: Phaser.GameObjects.Text;
  private pausedOverlay?: Phaser.GameObjects.Rectangle;

  constructor() {
    super('UIScene');
  }

  create(): void {
    this.hudText = this.add.text(24, 18, '', { fontSize: '20px', color: '#e2e8f0', fontStyle: 'bold' }).setDepth(1000);
    this.warningText = this.add.text(this.scale.width / 2, 52, '', { fontSize: '24px', color: '#f87171', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(1000);

    this.pausedOverlay = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x020617, 0.55)
      .setVisible(false)
      .setDepth(1001);
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'PAUSED\nPress Esc to continue', { fontSize: '36px', color: '#f8fafc', align: 'center' })
      .setOrigin(0.5)
      .setDepth(1002)
      .setVisible(false)
      .setName('pauseLabel');

    this.game.events.on('hud:update', this.onHudUpdate, this);
    this.game.events.on('hud:pause', this.onPause, this);
  }

  private onHudUpdate(state: GameHudState): void {
    this.hudText?.setText([
      `Score: ${state.score}`,
      `Health: ${state.health}`,
      `Cleaned: ${state.cleaned}/${state.quota}`,
      `Stability: ${Math.round(state.stability * 100)}%`,
      `Anchor CD: ${state.anchorCooldown.toFixed(1)}s`,
    ]);
    this.warningText?.setText(state.warning ?? '');
  }

  private onPause(paused: boolean): void {
    this.pausedOverlay?.setVisible(paused);
    this.children.getByName('pauseLabel')?.setVisible(paused);
  }
}
