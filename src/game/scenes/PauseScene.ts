import Phaser from 'phaser';
import { CSS, FONT, PALETTE, VIEW } from '../config';
import { audio } from '../audio/AudioEngine';

interface MenuEntry {
  text: Phaser.GameObjects.Text;
  y: number;
  activate: () => void;
  refresh?: () => string;
  /** The selection slide, tracked so it can be replaced without killing the fade-in. */
  slide?: Phaser.Tweens.Tween;
}

const PANEL_X = 360;
const PANEL_Y = 108;
const PANEL_W = 560;
const PANEL_H = 504;

const MENU_TOP = 262;
const MENU_PITCH = 52;
const ITEM_X = PANEL_X + 44;
const PLATE_W = PANEL_W - 56;

const CONTROL_ROWS: Array<[string, string]> = [
  ['WALK', 'A / D'],
  ['BRACE', 'S'],
  ['CLEAN', 'SPACE'],
  ['WINCH', 'W'],
  ['SAFETY LINE', 'SHIFT'],
  ['MUTE', 'M'],
];

/**
 * Pause overlay. GameScene owns its own pause/resume lifecycle — this scene
 * only reports the player's choice back over GameScene's emitter and removes
 * itself, so there is exactly one place that knows how to unpause.
 */
export class PauseScene extends Phaser.Scene {
  private panel!: Phaser.GameObjects.Container;
  private plate!: Phaser.GameObjects.Container;
  private scrim!: Phaser.GameObjects.Rectangle;
  private grain!: Phaser.GameObjects.TileSprite;

  private entries: MenuEntry[] = [];
  private index = 0;
  private closing = false;

  constructor() {
    super('PauseScene');
  }

  create(): void {
    this.entries = [];
    this.index = 0;
    this.closing = false;

    this.buildBackdrop();
    this.buildPanel();
    this.buildMenu();
    this.bindInput();
  }

  /* -------------------------------------------------------------- visuals */

  private hazard(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, dir = 1): void {
    g.fillStyle(PALETTE.ink, 0.92);
    g.fillRect(x, y, w, h);
    g.fillStyle(PALETTE.amber, 0.92);
    const band = 12;
    for (let j = 0; j < h; j += 2) {
      for (let sx = -band * 3; sx < w + band * 3; sx += band * 2) {
        const px = x + sx + dir * j;
        const x0 = Math.max(x, px);
        const x1 = Math.min(x + w, px + band);
        if (x1 > x0) g.fillRect(x0, y + j, x1 - x0, Math.min(2, h - j));
      }
    }
  }

  private buildBackdrop(): void {
    this.scrim = this.add.rectangle(VIEW.W / 2, VIEW.H / 2, VIEW.W, VIEW.H, PALETTE.ink, 1).setAlpha(0);
    this.tweens.add({ targets: this.scrim, alpha: 0.74, duration: 260, ease: 'Quad.Out' });

    // Two oversized soft washes stand in for a real blur: the frozen frame
    // underneath keeps reading as depth without a shader pass.
    const washes: Phaser.GameObjects.Image[] = [
      this.add.image(300, 220, 'glow').setDisplaySize(900, 700).setTint(0x2b3d66),
      this.add.image(1000, 540, 'glow').setDisplaySize(1000, 760).setTint(0x4a2c3e),
    ];
    for (const w of washes) {
      w.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.tweens.add({ targets: w, alpha: 0.2, duration: 420, ease: 'Quad.Out' });
    }

    this.grain = this.add.tileSprite(VIEW.W / 2, VIEW.H / 2, VIEW.W, VIEW.H, 'grain').setAlpha(0);
    this.tweens.add({ targets: this.grain, alpha: 0.075, duration: 320 });

    this.add
      .image(VIEW.W / 2, VIEW.H / 2, 'vignette')
      .setDisplaySize(VIEW.W, VIEW.H)
      .setAlpha(0.9);
  }

  private buildPanel(): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 0.95);
    g.fillRoundedRect(0, 0, PANEL_W, PANEL_H, 10);
    g.lineStyle(1.5, PALETTE.steel, 0.6);
    g.strokeRoundedRect(0, 0, PANEL_W, PANEL_H, 10);
    this.hazard(g, 0, 0, PANEL_W, 10, 1);
    g.lineStyle(1, PALETTE.steel, 0.26);
    g.lineBetween(40, 104, PANEL_W - 40, 104);
    g.lineBetween(40, 336, PANEL_W - 40, 336);

    const kids: Phaser.GameObjects.GameObject[] = [g];
    kids.push(
      this.add
        .text(PANEL_W / 2, 48, 'SHIFT PAUSED', {
          fontFamily: FONT,
          fontSize: '38px',
          color: CSS.amber,
          fontStyle: 'bold',
          letterSpacing: 7,
        })
        .setOrigin(0.5, 0),
    );
    kids.push(
      this.add
        .text(PANEL_W / 2, 88, 'THE BUILDING IS WAITING.', {
          fontFamily: FONT,
          fontSize: '12px',
          color: CSS.dim,
          letterSpacing: 5,
        })
        .setOrigin(0.5, 0),
    );

    CONTROL_ROWS.forEach(([action, keys], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = 44 + col * (PANEL_W - 88) / 2;
      const cy = 352 + row * 26;
      kids.push(
        this.add.text(cx, cy, action, {
          fontFamily: FONT,
          fontSize: '12px',
          color: CSS.dim,
          letterSpacing: 2,
        }),
      );
      kids.push(
        this.add
          .text(cx + (PANEL_W - 88) / 2 - 16, cy, keys, {
            fontFamily: FONT,
            fontSize: '12px',
            color: CSS.paper,
            fontStyle: 'bold',
            letterSpacing: 1,
          })
          .setOrigin(1, 0),
      );
    });

    kids.push(
      this.add
        .text(PANEL_W / 2, PANEL_H - 34, 'ESC · P  RESUME', {
          fontFamily: FONT,
          fontSize: '11px',
          color: CSS.dim,
          letterSpacing: 4,
        })
        .setOrigin(0.5, 0),
    );

    // Only a short travel: the menu rows live outside this container (their hit
    // areas are in world space), so a big slide would visibly desynchronise them.
    this.panel = this.add.container(PANEL_X, PANEL_Y + 12, kids).setAlpha(0).setScale(0.98);
    this.tweens.add({
      targets: this.panel,
      alpha: 1,
      scale: 1,
      y: PANEL_Y,
      duration: 300,
      ease: 'Back.Out',
    });
  }

  private buildMenu(): void {
    const plateGfx = this.add.graphics();
    plateGfx.fillStyle(PALETTE.concreteDark, 0.9);
    plateGfx.fillRoundedRect(-16, -21, PLATE_W, 42, 4);
    plateGfx.lineStyle(1, PALETTE.amber, 0.55);
    plateGfx.strokeRoundedRect(-16, -21, PLATE_W, 42, 4);
    plateGfx.fillStyle(PALETTE.amber, 1);
    plateGfx.fillRect(-16, -21, 4, 42);

    const chevron = this.add.graphics();
    chevron.fillStyle(PALETTE.amber, 1);
    chevron.fillTriangle(-2, -6, -2, 6, 7, 0);

    this.plate = this.add.container(ITEM_X, MENU_TOP, [plateGfx, chevron]).setAlpha(0);
    this.tweens.add({ targets: this.plate, alpha: 1, duration: 260, delay: 200 });

    const add = (label: string, activate: () => void, refresh?: () => string): void => {
      const i = this.entries.length;
      const y = MENU_TOP + i * MENU_PITCH;
      const text = this.add
        .text(ITEM_X + 22, y, label, {
          fontFamily: FONT,
          fontSize: '22px',
          color: CSS.dim,
          fontStyle: 'bold',
          letterSpacing: 3,
        })
        .setOrigin(0, 0.5)
        .setAlpha(0);

      const hit = this.add
        .rectangle(ITEM_X - 16 + PLATE_W / 2, y, PLATE_W, 42, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this.select(i));
      hit.on('pointerdown', () => {
        this.select(i);
        this.activate();
      });

      // Alpha only. `select` owns this label's x, and killing tweens by target
      // would otherwise cancel the fade-in before it ever ran.
      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 300,
        delay: 180 + i * 70,
        ease: 'Quad.Out',
      });
      this.entries.push({ text, y, activate, refresh });
    };

    add('RESUME', () => this.close('resume'));
    add('RESTART SHIFT', () => this.close('restart'));
    const muteLabel = (): string => (audio.isMuted ? 'AUDIO: MUTED' : 'AUDIO: ON');
    add(
      muteLabel(),
      () => {
        audio.toggleMute();
        audio.play('click');
        this.refreshLabels();
      },
      muteLabel,
    );
    add('QUIT TO TITLE', () => this.close('quit'));

    this.select(0, true);
  }

  private refreshLabels(): void {
    for (const entry of this.entries) {
      if (entry.refresh) entry.text.setText(entry.refresh());
    }
  }

  private select(i: number, instant = false): void {
    const next = Phaser.Math.Wrap(i, 0, this.entries.length);
    if (next === this.index && !instant) return;
    this.index = next;

    this.entries.forEach((entry, k) => {
      const on = k === this.index;
      const x = on ? ITEM_X + 30 : ITEM_X + 22;
      entry.text.setColor(on ? CSS.paper : CSS.dim);
      entry.slide?.remove();
      if (instant) {
        entry.text.x = x;
        entry.slide = undefined;
      } else {
        entry.slide = this.tweens.add({ targets: entry.text, x, duration: 160, ease: 'Quad.Out' });
      }
    });

    const y = this.entries[this.index].y;
    if (instant) {
      this.plate.y = y;
    } else {
      this.tweens.add({ targets: this.plate, y, duration: 180, ease: 'Back.Out' });
      audio.play('click', { volume: 0.5 });
    }
  }

  private activate(): void {
    if (this.closing) return;
    this.entries[this.index].activate();
  }

  /**
   * Animate out first, then hand the decision to GameScene. Emitting before
   * the overlay has gone would show one frame of live game behind the panel.
   */
  private close(intent: 'resume' | 'restart' | 'quit'): void {
    if (this.closing) return;
    this.closing = true;
    audio.play(intent === 'resume' ? 'click' : 'confirm');

    this.tweens.add({
      targets: this.panel,
      alpha: 0,
      scale: 0.95,
      y: PANEL_Y + 18,
      duration: 180,
      ease: 'Quad.In',
    });
    this.tweens.add({ targets: [this.plate, this.scrim, this.grain], alpha: 0, duration: 180 });
    this.tweens.add({ targets: this.entries.map((e) => e.text), alpha: 0, duration: 150 });

    this.time.delayedCall(190, () => {
      this.scene.get<Phaser.Scene>('GameScene').events.emit(intent);
      this.scene.stop();
    });
  }

  private bindInput(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-UP', () => this.select(this.index - 1));
    kb.on('keydown-W', () => this.select(this.index - 1));
    kb.on('keydown-DOWN', () => this.select(this.index + 1));
    kb.on('keydown-S', () => this.select(this.index + 1));
    kb.on('keydown-ENTER', () => this.activate());
    kb.on('keydown-SPACE', () => this.activate());
    kb.on('keydown-M', () => {
      audio.toggleMute();
      audio.play('click');
      this.refreshLabels();
    });
    kb.on('keydown-ESC', () => this.close('resume'));
    kb.on('keydown-P', () => this.close('resume'));
  }

  update(): void {
    this.grain.tilePositionX = (this.grain.tilePositionX + 4) % 128;
    this.grain.tilePositionY = (this.grain.tilePositionY + 3) % 128;
  }
}
