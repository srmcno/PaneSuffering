import Phaser from 'phaser';
import { CSS, DEPTH, FONT, PALETTE, VIEW } from '../config';
import { Rng } from '../core/Rng';
import { Backdrop } from '../world/Backdrop';
import { audio } from '../audio/AudioEngine';
import { onKeyPress } from '../core/keys';
import { Save } from '../systems/Save';

interface MenuEntry {
  text: Phaser.GameObjects.Text;
  y: number;
  activate: () => void;
  /** Present on entries whose label reflects mutable state (the mute toggle). */
  refresh?: () => string;
  /** The selection slide, tracked so it can be replaced without killing the fade-in. */
  slide?: Phaser.Tweens.Tween;
}

const COL_X = 118;
const MENU_TOP = 424;
const MENU_PITCH = 56;
const PLATE_W = 430;

const UI_DEPTH = DEPTH.overlay;

const CONTROL_ROWS: Array<[string, string]> = [
  ['WALK THE DECK', 'A / D   ←  →'],
  ['CROUCH & BRACE', 'S   ↓'],
  ['CLEAN (HOLD)', 'SPACE   LMB'],
  ['WINCH UP A FLOOR', 'W   ↑'],
  ['SAFETY LINE', 'SHIFT   RMB'],
  ['PAUSE', 'ESC / P'],
  ['MUTE', 'M'],
];

/**
 * Title screen. Shares the in-game Backdrop so the menu sits in the same sky
 * the player is about to be hung out in, with a silhouetted tower edge and a
 * doll-sized rig for scale.
 */
export class TitleScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private rig!: Phaser.GameObjects.Container;
  private plate!: Phaser.GameObjects.Container;
  private panel!: Phaser.GameObjects.Container;
  private scrim!: Phaser.GameObjects.Rectangle;
  private grain!: Phaser.GameObjects.TileSprite;

  private entries: MenuEntry[] = [];
  private index = 0;
  private panelOpen = false;
  private leaving = false;
  private t = 0;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.entries = [];
    this.index = 0;
    this.panelOpen = false;
    this.leaving = false;
    this.t = 0;

    // Coming back from a run: the HUD overlay may still be alive.
    if (this.scene.isActive('UIScene')) this.scene.stop('UIScene');

    this.backdrop = new Backdrop(this);
    this.buildTower();
    this.buildRig();
    this.buildAtmosphere();
    this.buildLogo();
    this.buildMenu();
    this.buildControlsPanel();
    this.bindInput();

    this.cameras.main.fadeIn(520, 0, 0, 0);
  }

  /* --------------------------------------------------------------- world */

  /**
   * Only the near corner of the tower, not a wall: a narrow slab of facade that
   * gives the rig something to hang against and the frame a sense of mass,
   * while leaving the sky to do the work.
   */
  private buildTower(): void {
    const rng = new Rng(0x7042c1);
    const left = 1080;
    const right = VIEW.W + 160;
    const top = -160;
    const height = VIEW.H + 400;
    const g = this.add.graphics().setScrollFactor(0.5).setDepth(-500);

    g.fillStyle(0x0c1220, 1);
    g.fillRect(left, top, right - left, height);
    // Raking dusk light catches the near corner and nothing else.
    g.fillStyle(PALETTE.concreteLight, 0.5);
    g.fillRect(left, top, 13, height);
    g.fillStyle(0xffb072, 0.42);
    g.fillRect(left, top, 4, height);
    g.fillStyle(0x05080f, 0.55);
    g.fillRect(left + 13, top, 26, height);

    this.add
      .tileSprite(left, top, right - left, height, 'concreteNoise')
      .setOrigin(0, 0)
      .setAlpha(0.5)
      .setScrollFactor(0.5)
      .setDepth(-499);

    for (let y = -140; y < VIEW.H + 260; y += 98) {
      g.fillStyle(0x161d2c, 1);
      g.fillRect(left + 13, y, right - left - 13, 8);
      for (let x = left + 46; x < right - 46; x += 76) {
        const lit = rng.chance(0.34);
        if (lit) {
          // Warm room, brighter pool near the ceiling, and a desk silhouette:
          // enough separation from the unlit glass to read at this size.
          g.fillStyle(0x6a5326, 1);
          g.fillRect(x, y + 18, 54, 60);
          g.fillStyle(0xffd9a0, rng.between(0.3, 0.52));
          g.fillRect(x + 2, y + 20, 50, 30);
          if (rng.chance(0.55)) {
            g.fillStyle(0x120d06, 0.85);
            g.fillRect(x + rng.int(8, 32), y + 44, 11, 34);
          }
        } else {
          g.fillStyle(0x0a1120, 1);
          g.fillRect(x, y + 18, 54, 60);
          g.fillStyle(0x1a2740, 0.5);
          g.fillRect(x, y + 18, 54, 14);
        }
        g.fillStyle(0x222c40, 0.9);
        g.fillRect(x + 26, y + 18, 2, 60);

        if (lit) {
          this.add
            .image(x + 27, y + 44, 'glow')
            .setDisplaySize(170, 130)
            .setTint(0xffc888)
            .setAlpha(rng.between(0.1, 0.2))
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScrollFactor(0.5)
            .setDepth(-498);
        }
      }
    }
  }

  private buildRig(): void {
    const g = this.add.graphics();
    const drop = 424;
    const half = 74;

    g.lineStyle(2, 0x0c1220, 1);
    g.lineBetween(-half + 6, 0, -half + 6, drop);
    g.lineBetween(half - 6, 0, half - 6, drop);

    // Deck, rails, and the bucket that will inevitably go over the side.
    g.fillStyle(0x0a0e18, 1);
    g.fillRect(-half, drop, half * 2, 7);
    g.fillStyle(0x121a2a, 1);
    g.fillRect(-half, drop, half * 2, 2);
    g.lineStyle(2, 0x0a0e18, 1);
    g.lineBetween(-half + 4, drop, -half + 4, drop - 22);
    g.lineBetween(half - 4, drop, half - 4, drop - 22);
    g.lineBetween(-half + 4, drop - 22, half - 4, drop - 22);
    g.fillStyle(0x0a0e18, 1);
    g.fillRect(34, drop - 13, 13, 13);

    // Washer: a silhouette with one spot of hi-vis, which is all the colour
    // a figure this small needs to register as human.
    const wx = -24;
    g.fillStyle(0x070a12, 1);
    g.fillRect(wx - 6, drop - 30, 13, 22);
    g.fillCircle(wx, drop - 36, 7);
    g.fillRect(wx - 7, drop - 9, 5, 9);
    g.fillRect(wx + 2, drop - 9, 5, 9);
    g.fillStyle(PALETTE.hiVis, 0.85);
    g.fillRect(wx - 6, drop - 26, 13, 5);
    g.lineStyle(2, 0x070a12, 1);
    g.lineBetween(wx + 5, drop - 27, wx + 22, drop - 48);
    g.lineStyle(3, 0x0a0e18, 1);
    g.lineBetween(wx + 18, drop - 44, wx + 30, drop - 52);

    // Hung against the visible face of the corner slab, not out over the sky.
    this.rig = this.add.container(1176, -72, [g]).setScrollFactor(0.5).setDepth(-480);
  }

  private buildAtmosphere(): void {
    const rng = new Rng(0x6d05c);
    for (let i = 0; i < 18; i++) {
      const mote = this.add
        .image(rng.between(0, VIEW.W), rng.between(80, VIEW.H), 'dust')
        .setScale(rng.between(0.3, 1.1))
        .setAlpha(rng.between(0.05, 0.18))
        .setScrollFactor(0)
        .setDepth(300);
      this.tweens.add({
        targets: mote,
        x: mote.x + rng.between(-90, 90),
        y: mote.y - rng.between(40, 160),
        alpha: 0,
        duration: rng.between(7000, 15000),
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }

    this.buildKeyArtScrim();

    this.add
      .image(VIEW.W / 2, VIEW.H / 2, 'vignette')
      .setDisplaySize(VIEW.W, VIEW.H)
      .setScrollFactor(0)
      .setDepth(380)
      .setAlpha(0.95);
    this.grain = this.add
      .tileSprite(VIEW.W / 2, VIEW.H / 2, VIEW.W, VIEW.H, 'grain')
      .setScrollFactor(0)
      .setDepth(384)
      .setAlpha(0.055);
  }

  /**
   * Left-edge key-art gradient. The shared Backdrop parks its sun disc right
   * behind the menu column, and the 'glow' texture falls off far too fast to
   * cover it, so the ramp is drawn explicitly as banded strips.
   */
  private buildKeyArtScrim(): void {
    const g = this.add.graphics().setScrollFactor(0).setDepth(340);
    const steps = 64;
    const width = 840;
    // Strips are snapped to integer edges and never overlap: an overlapping
    // seam blends twice and shows up as a visible stripe.
    for (let i = 0; i < steps; i++) {
      const x0 = Math.round((width * i) / steps);
      const x1 = Math.round((width * (i + 1)) / steps);
      g.fillStyle(0x03060e, 0.72 * Math.pow(1 - i / (steps - 1), 1.3));
      g.fillRect(x0, 0, x1 - x0, VIEW.H);
    }
  }

  /**
   * A backing plate under the whole menu block. The ramp alone cannot fully
   * kill the sun disc sitting behind these rows, and a solid ground also ties
   * the menu to the panel language used by the pause and results screens.
   */
  private buildMenuPlate(): void {
    const g = this.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH + 10).setAlpha(0);
    g.fillStyle(PALETTE.ink, 0.58);
    g.fillRoundedRect(88, 388, 460, 184, 6);
    g.lineStyle(1, PALETTE.steel, 0.16);
    g.strokeRoundedRect(88, 388, 460, 184, 6);
    this.tweens.add({ targets: g, alpha: 1, duration: 460, delay: 1200, ease: 'Quad.Out' });
  }

  /* ---------------------------------------------------------------- logo */

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

  /** Per-letter text so the lockup can be dealt in like a hand of cards. */
  private lockupLine(chars: string, x: number, y: number, size: number, color: string, spacing: number, delay: number): void {
    const style = (c: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: c,
      fontStyle: 'bold',
    });

    let cx = x;
    let i = 0;
    for (const ch of chars) {
      if (ch === ' ') {
        cx += size * 0.3 + spacing;
        continue;
      }
      const echo = this.add.text(6, 9, ch, style('#04060c')).setOrigin(0, 0.5).setAlpha(0.9);
      const edge = this.add.text(-3, -4, ch, style(CSS.amber)).setOrigin(0, 0.5).setAlpha(0.3);
      const main = this.add.text(0, 0, ch, style(color)).setOrigin(0, 0.5).setStroke('#080b12', 5);

      const cell = this.add
        .container(cx, y + 60, [echo, edge, main])
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 20)
        .setAlpha(0);
      this.tweens.add({
        targets: cell,
        y,
        alpha: 1,
        duration: 560,
        delay: delay + i * 44,
        ease: 'Back.Out',
      });
      cx += main.width + spacing;
      i++;
    }
  }

  private buildLogo(): void {
    this.lockupLine('PANE', COL_X, 168, 128, CSS.paper, 6, 220);
    this.lockupLine('& SUFFERING', COL_X, 264, 58, CSS.amber, 8, 520);

    const rule = this.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH + 18);
    this.hazard(rule, COL_X, 302, 512, 10, 1);
    rule.setAlpha(0);
    this.tweens.add({ targets: rule, alpha: 1, duration: 500, delay: 980, ease: 'Quad.Out' });

    const sub = this.add
      .text(COL_X + 2, 326, 'A JOB WITH A VIEW', {
        fontFamily: FONT,
        fontSize: '16px',
        color: CSS.dim,
        letterSpacing: 9,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 18)
      .setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, x: COL_X, duration: 600, delay: 1120, ease: 'Quad.Out' });
  }

  /* ---------------------------------------------------------------- menu */

  private buildMenu(): void {
    this.buildMenuPlate();

    const plateGfx = this.add.graphics();
    plateGfx.fillStyle(PALETTE.ink, 0.72);
    plateGfx.fillRoundedRect(-16, -23, PLATE_W, 46, 5);
    plateGfx.lineStyle(1, PALETTE.steel, 0.4);
    plateGfx.strokeRoundedRect(-16, -23, PLATE_W, 46, 5);
    plateGfx.fillStyle(PALETTE.amber, 1);
    plateGfx.fillRect(-16, -23, 5, 46);
    this.hazard(plateGfx, PLATE_W - 74, 12, 58, 8, -1);

    const chevron = this.add.graphics();
    chevron.fillStyle(PALETTE.amber, 1);
    chevron.fillTriangle(-4, -7, -4, 7, 6, 0);
    chevron.x = 4;

    this.plate = this.add
      .container(COL_X, MENU_TOP, [plateGfx, chevron])
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 14)
      .setAlpha(0);
    this.tweens.add({ targets: this.plate, alpha: 1, duration: 400, delay: 1300 });

    const add = (label: string, activate: () => void, refresh?: () => string): void => {
      const y = MENU_TOP + this.entries.length * MENU_PITCH;
      const text = this.add
        .text(COL_X + 24, y, label, {
          fontFamily: FONT,
          fontSize: '27px',
          color: CSS.dim,
          fontStyle: 'bold',
          letterSpacing: 3,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 16)
        .setAlpha(0);

      const hit = this.add
        .rectangle(COL_X - 16 + PLATE_W / 2, y, PLATE_W, 46, 0xffffff, 0)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 17)
        .setInteractive({ useHandCursor: true });
      const i = this.entries.length;
      hit.on('pointerover', () => this.select(i));
      hit.on('pointerdown', () => {
        audio.unlock();
        this.select(i);
        this.activate();
      });

      // Alpha only. `select` owns this label's x, and killing tweens by target
      // would otherwise cancel the fade-in before it ever ran.
      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 420,
        delay: 1300 + i * 110,
        ease: 'Quad.Out',
      });
      this.entries.push({ text, y, activate, refresh });
    };

    add('START SHIFT', () => this.startShift());
    add('CONTROLS', () => this.toggleControls());
    const muteEntry = (): string => (audio.isMuted ? 'AUDIO: MUTED' : 'AUDIO: ON');
    add(
      muteEntry(),
      () => {
        audio.unlock();
        audio.toggleMute();
        audio.play('click');
        this.refreshLabels();
      },
      () => muteEntry(),
    );

    this.buildFooter();
    this.select(0, true);
  }

  private buildFooter(): void {
    const save = Save.load();
    let y = 600;
    if (save.bestScore > 0) {
      const best = this.add
        .text(
          COL_X,
          y,
          `PERSONAL BEST   ${save.bestScore.toLocaleString('en-US')}   ·   ${save.bestFloor} FLOOR${save.bestFloor === 1 ? '' : 'S'} CLEARED   ·   ${save.runs} SHIFT${save.runs === 1 ? '' : 'S'}`,
          { fontFamily: FONT, fontSize: '14px', color: CSS.amber, letterSpacing: 3 },
        )
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 16)
        .setAlpha(0);
      this.tweens.add({ targets: best, alpha: 0.9, duration: 520, delay: 1700 });
      y += 30;
    }

    const hint = this.add
      .text(COL_X, y, '↑ ↓ / W S  SELECT      ENTER · SPACE  CONFIRM      M  MUTE', {
        fontFamily: FONT,
        fontSize: '12px',
        color: CSS.dim,
        letterSpacing: 2,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 16)
      .setAlpha(0);
    this.tweens.add({ targets: hint, alpha: 0.65, duration: 520, delay: 1820 });
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
      const x = on ? COL_X + 32 : COL_X + 24;
      entry.text.setColor(on ? CSS.paper : CSS.dim);
      entry.slide?.remove();
      if (instant) {
        entry.text.x = x;
        entry.slide = undefined;
      } else {
        entry.slide = this.tweens.add({ targets: entry.text, x, duration: 180, ease: 'Quad.Out' });
      }
    });

    const y = this.entries[this.index].y;
    if (instant) {
      this.plate.y = y;
    } else {
      this.tweens.add({ targets: this.plate, y, duration: 200, ease: 'Back.Out' });
      audio.play('click', { volume: 0.5 });
    }
  }

  private activate(): void {
    if (this.leaving) return;
    // Confirm closes the controls panel rather than falling through to the
    // menu row hidden behind it.
    if (this.panelOpen) {
      this.toggleControls();
      return;
    }
    this.entries[this.index].activate();
  }

  private startShift(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.unlock();
    audio.startMusic();
    audio.play('confirm');
    this.cameras.main.fadeOut(340, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('GameScene'));
  }

  /* ------------------------------------------------------------ controls */

  private buildControlsPanel(): void {
    const x = 560;
    const y = 178;
    const w = 620;
    const h = 392;

    this.scrim = this.add
      .rectangle(VIEW.W / 2, VIEW.H / 2, VIEW.W, VIEW.H, PALETTE.ink, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 28)
      .setAlpha(0)
      .setVisible(false);
    // Interactive purely to swallow clicks aimed at the menu behind the modal.
    this.scrim.setInteractive();
    this.scrim.on('pointerdown', () => this.toggleControls());

    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 0.93);
    g.fillRoundedRect(0, 0, w, h, 8);
    g.lineStyle(1.5, PALETTE.steel, 0.55);
    g.strokeRoundedRect(0, 0, w, h, 8);
    this.hazard(g, 0, 0, w, 9, 1);
    g.lineStyle(1, PALETTE.steel, 0.28);
    g.lineBetween(34, 66, w - 34, 66);

    const kids: Phaser.GameObjects.GameObject[] = [g];
    kids.push(
      this.add.text(34, 28, 'CONTROLS', {
        fontFamily: FONT,
        fontSize: '24px',
        color: CSS.amber,
        fontStyle: 'bold',
        letterSpacing: 6,
      }),
    );

    CONTROL_ROWS.forEach(([action, keys], i) => {
      const ry = 92 + i * 36;
      kids.push(
        this.add.text(34, ry, action, {
          fontFamily: FONT,
          fontSize: '15px',
          color: CSS.dim,
          letterSpacing: 3,
        }),
      );
      kids.push(
        this.add
          .text(w - 34, ry, keys, {
            fontFamily: FONT,
            fontSize: '15px',
            color: CSS.paper,
            fontStyle: 'bold',
            letterSpacing: 2,
          })
          .setOrigin(1, 0),
      );
    });

    g.lineStyle(1, PALETTE.steel, 0.28);
    g.lineBetween(34, h - 52, w - 34, h - 52);
    kids.push(
      this.add.text(34, h - 34, 'THE DECK TILTS UNDER YOUR WEIGHT. CROUCH TO BRACE IT.', {
        fontFamily: FONT,
        fontSize: '12px',
        color: CSS.amber,
        letterSpacing: 2,
      }),
    );

    this.panel = this.add
      .container(x, y, kids)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 30)
      .setAlpha(0)
      .setVisible(false);
  }

  private toggleControls(): void {
    this.panelOpen = !this.panelOpen;
    audio.play('click');
    this.tweens.killTweensOf([this.panel, this.scrim]);

    if (this.panelOpen) {
      this.panel.setVisible(true).setAlpha(0).setScale(0.95).setY(198);
      this.scrim.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.panel, alpha: 1, scale: 1, y: 178, duration: 300, ease: 'Back.Out' });
      this.tweens.add({ targets: this.scrim, alpha: 0.62, duration: 260 });
    } else {
      this.tweens.add({
        targets: this.panel,
        alpha: 0,
        scale: 0.96,
        y: 194,
        duration: 200,
        ease: 'Quad.In',
        onComplete: () => this.panel.setVisible(false),
      });
      this.tweens.add({
        targets: this.scrim,
        alpha: 0,
        duration: 200,
        onComplete: () => this.scrim.setVisible(false),
      });
    }
  }

  /* --------------------------------------------------------------- input */

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());

    const kb = this.input.keyboard;
    if (!kb) return;
    // WebAudio will not start outside a gesture; every key press is one.
    kb.on('keydown', () => audio.unlock());
    onKeyPress(kb, ['UP', 'W'], () => this.select(this.index - 1));
    onKeyPress(kb, ['DOWN', 'S'], () => this.select(this.index + 1));
    onKeyPress(kb, ['ENTER', 'SPACE'], () => this.activate());
    onKeyPress(kb, 'M', () => {
      audio.toggleMute();
      audio.play('click');
      this.refreshLabels();
    });
    onKeyPress(kb, 'ESC', () => {
      if (this.panelOpen) this.toggleControls();
    });
  }

  /* -------------------------------------------------------------- update */

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    this.t += dt;

    // A dusk that never quite settles, plus a hand-held drift on the camera.
    this.backdrop.update(dt, 0.5 + 0.14 * Math.sin(this.t * 0.09));
    this.cameras.main.scrollX = Math.sin(this.t * 0.055) * 18;
    this.cameras.main.scrollY = Math.sin(this.t * 0.041 + 1.2) * 22;

    this.rig.rotation = Math.sin(this.t * 0.62) * 0.028 + Math.sin(this.t * 1.31) * 0.006;
    this.grain.tilePositionX = (this.grain.tilePositionX + 3) % 128;
    this.grain.tilePositionY = (this.grain.tilePositionY + 2) % 128;
  }
}
