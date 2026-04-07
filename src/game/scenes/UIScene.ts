import Phaser from 'phaser';

export class UIScene extends Phaser.Scene {
  private quotaText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private stabilityBar!: Phaser.GameObjects.Rectangle;
  private anchorBar!: Phaser.GameObjects.Rectangle;
  private warningText!: Phaser.GameObjects.Text;
  private pauseOverlay!: Phaser.GameObjects.Container;

  constructor() {
    super('ui');
  }

  create(): void {
    const panel = this.add.rectangle(10, 10, 370, 160, 0x05070f, 0.58).setOrigin(0).setStrokeStyle(2, 0x8ca6d0, 0.5);
    panel.setScrollFactor(0);

    this.quotaText = this.add.text(22, 20, 'Quota: 0/0', { fontSize: '22px', color: '#e7f2ff' });
    this.scoreText = this.add.text(22, 50, 'Score: 0', { fontSize: '22px', color: '#f7df95' });
    this.healthText = this.add.text(22, 80, 'Health: 100', { fontSize: '22px', color: '#ffb4b4' });

    this.add.text(22, 110, 'Stability', { fontSize: '18px', color: '#d2e6ff' });
    this.stabilityBar = this.add.rectangle(140, 121, 200, 14, 0x5fe38f).setOrigin(0, 0.5);

    this.add.text(22, 134, 'Anchor', { fontSize: '18px', color: '#d2e6ff' });
    this.anchorBar = this.add.rectangle(140, 145, 200, 10, 0x8db5ff).setOrigin(0, 0.5);

    this.warningText = this.add.text(this.scale.width / 2, 40, '', {
      fontSize: '28px',
      color: '#ffe47e',
      stroke: '#000',
      strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0);

    this.pauseOverlay = this.add.container(this.scale.width / 2, this.scale.height / 2, [
      this.add.rectangle(0, 0, 420, 180, 0x000000, 0.75),
      this.add.text(0, -16, 'PAUSED', { fontSize: '46px', color: '#ffffff' }).setOrigin(0.5),
      this.add.text(0, 34, 'Press ESC to resume', { fontSize: '24px', color: '#ced9ef' }).setOrigin(0.5),
    ]).setVisible(false);

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.warningText.setPosition(size.width / 2, 40);
      this.pauseOverlay.setPosition(size.width / 2, size.height / 2);
    });
  }

  setHud(data: { cleaned: number; quota: number; score: number; health: number; stability: number; anchor: number }): void {
    this.quotaText.setText(`Quota: ${data.cleaned}/${data.quota}`);
    this.scoreText.setText(`Score: ${data.score}`);
    this.healthText.setText(`Health: ${Math.max(0, Math.round(data.health))}`);
    this.stabilityBar.width = 200 * Phaser.Math.Clamp(data.stability, 0, 1);
    this.stabilityBar.fillColor = data.stability > 0.6 ? 0x5fe38f : data.stability > 0.3 ? 0xffd86d : 0xff6464;
    this.anchorBar.width = 200 * Phaser.Math.Clamp(data.anchor, 0, 1);
  }

  showWarning(text: string): void {
    this.warningText.setText(text);
    this.tweens.killTweensOf(this.warningText);
    this.warningText.setAlpha(1);
    this.tweens.add({
      targets: this.warningText,
      alpha: 0,
      duration: 1700,
      ease: 'Sine.easeOut',
    });
  }

  showPause(paused: boolean): void {
    this.pauseOverlay.setVisible(paused);
  }
}
