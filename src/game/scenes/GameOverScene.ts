import Phaser from 'phaser';
import { CSS, FONT, PALETTE, VIEW } from '../config';
import { audio } from '../audio/AudioEngine';
import { onKeyPress } from '../core/keys';
import type { RunSummary } from '../types/GameTypes';

interface MenuEntry {
  root: Phaser.GameObjects.Container;
  highlight: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  activate: () => void;
}

interface Grade {
  letter: string;
  word: string;
  color: number;
  css: string;
}

const CX = VIEW.W / 2;
const PANEL_X = 250;
const PANEL_Y = 196;
const PANEL_W = 780;
const PANEL_H = 328;

const ROW_X = PANEL_X + 36;
const ROW_W = 454;
const ROW_TOP = 262;
const ROW_PITCH = 42;

const BADGE_X = 910;
const BADGE_Y = 330;

const BTN_W = 300;
const BTN_H = 54;
const BTN_Y = 638;

const FALLBACK: RunSummary = {
  win: false,
  score: 0,
  bestScore: 0,
  newBest: false,
  floorsCleared: 0,
  floorCount: 0,
  panesCleaned: 0,
  spotless: 0,
  bestMultiplier: 1,
  timeSeconds: 0,
  reason: 'unknown',
};

const WRY = [
  'PAYROLL HAS BEEN NOTIFIED. SO HAS GRAVITY.',
  'THE PANES WILL BE REASSIGNED BY MONDAY MORNING.',
  'YOUR LOCKER HAS ALREADY BEEN CLEARED OUT.',
  'ANOTHER SQUEEGEE JOINS THE STREET-LEVEL COLLECTION.',
  'THE BUILDING FILED NO COMPLAINT. IT RARELY DOES.',
];

/**
 * End-of-run report. Everything is fed in through `init` rather than the
 * registry so a summary can never outlive the run that produced it.
 */
export class GameOverScene extends Phaser.Scene {
  private summary: RunSummary = { ...FALLBACK };
  private entries: MenuEntry[] = [];
  private index = 0;
  private leaving = false;
  private grain!: Phaser.GameObjects.TileSprite;

  constructor() {
    super('GameOverScene');
  }

  init(data: RunSummary): void {
    this.summary = { ...FALLBACK, ...data };
    this.entries = [];
    this.index = 0;
    this.leaving = false;
  }

  create(): void {
    // The HUD belongs to a run that no longer exists.
    if (this.scene.isActive('UIScene')) this.scene.stop('UIScene');

    const grade = this.gradeFor(this.summary);
    this.buildBackdrop(grade);
    this.buildHeadline();
    this.buildPanel();
    const lastDelay = this.buildRows();
    this.buildGrade(grade, lastDelay + 260);
    this.buildBestLine(lastDelay + 620);
    this.buildButtons(lastDelay + 760);
    this.bindInput();

    this.cameras.main.fadeIn(420, 0, 0, 0);
  }

  /* --------------------------------------------------------------- grade */

  private gradeFor(s: RunSummary): Grade {
    const floorRatio = s.floorCount > 0 ? Phaser.Math.Clamp(s.floorsCleared / s.floorCount, 0, 1) : 0;
    const spotRatio = s.panesCleaned > 0 ? Phaser.Math.Clamp(s.spotless / s.panesCleaned, 0, 1) : 0;
    const scoreRatio = Phaser.Math.Clamp(s.score / 9000, 0, 1);
    // Weighted so finishing floors matters most, then raw score, then polish.
    let q = scoreRatio * 0.45 + floorRatio * 0.35 + spotRatio * 0.2;
    if (!s.win) q *= 0.85;

    if (s.win && q >= 0.86) return { letter: 'S', word: 'IMMACULATE', color: PALETTE.good, css: CSS.good };
    if (q >= 0.7) return { letter: 'A', word: 'PROFESSIONAL', color: PALETTE.good, css: CSS.good };
    if (q >= 0.52) return { letter: 'B', word: 'SERVICEABLE', color: PALETTE.amber, css: CSS.amber };
    if (q >= 0.32) return { letter: 'C', word: 'STREAKY', color: PALETTE.amber, css: CSS.amber };
    return { letter: 'D', word: 'A LIABILITY', color: PALETTE.danger, css: CSS.danger };
  }

  /* ------------------------------------------------------------- visuals */

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

  private buildBackdrop(grade: Grade): void {
    this.add.rectangle(CX, VIEW.H / 2, VIEW.W, VIEW.H, 0x05070d, 1);

    const tint = this.summary.win ? 0x2c5a4a : 0x5a2430;
    for (const [x, y, w, h] of [
      [220, 140, 1000, 760],
      [1060, 620, 900, 700],
    ]) {
      this.add
        .image(x, y, 'glow')
        .setDisplaySize(w, h)
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.34);
    }
    this.add
      .image(BADGE_X, BADGE_Y, 'glow')
      .setDisplaySize(560, 560)
      .setTint(grade.color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.1);

    this.grain = this.add.tileSprite(CX, VIEW.H / 2, VIEW.W, VIEW.H, 'grain').setAlpha(0.06);
    this.add.image(CX, VIEW.H / 2, 'vignette').setDisplaySize(VIEW.W, VIEW.H).setAlpha(0.95);
  }

  private buildHeadline(): void {
    const s = this.summary;
    const headline = s.win ? 'SHIFT COMPLETE' : `CAUSE OF TERMINATION: ${s.reason.toUpperCase()}`;
    const sub = s.win
      ? 'THE GLASS IS CLEAN. THE VIEW IS STILL AWFUL.'
      : WRY[(s.floorsCleared + s.panesCleaned) % WRY.length];

    const title = this.add
      .text(CX, 74, headline, {
        fontFamily: FONT,
        fontSize: s.win ? '62px' : '40px',
        color: s.win ? CSS.good : CSS.danger,
        fontStyle: 'bold',
        letterSpacing: s.win ? 10 : 4,
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setStroke('#04060c', 6)
      .setShadow(0, 4, '#000000cc', 10, false, true);

    // `reason` is free text, so shrink to fit rather than wrap into the panel.
    const maxW = VIEW.W - 170;
    let size = s.win ? 62 : 40;
    while (title.width > maxW && size > 20) {
      size -= 2;
      title.setFontSize(size);
    }

    // Clamp so a tall headline can never push the strapline under the panel.
    const ruleY = Math.min(74 + title.height + 14, PANEL_Y - 46);
    title.setAlpha(0).setScale(1.12);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 620, ease: 'Quad.Out' });

    const rule = this.add.graphics().setAlpha(0);
    this.hazard(rule, CX - 170, ruleY, 340, 8, 1);
    this.tweens.add({ targets: rule, alpha: 1, duration: 420, delay: 220 });

    const subText = this.add
      .text(CX, ruleY + 18, sub, {
        fontFamily: FONT,
        fontSize: '14px',
        color: CSS.dim,
        letterSpacing: 4,
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setAlpha(0);
    this.tweens.add({ targets: subText, alpha: 0.9, y: ruleY + 16, duration: 520, delay: 340 });
  }

  private buildPanel(): void {
    const g = this.add.graphics().setAlpha(0);
    g.fillStyle(PALETTE.ink, 0.86);
    g.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 10);
    g.lineStyle(1.5, PALETTE.steel, 0.45);
    g.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 10);
    g.fillStyle(PALETTE.amber, 0.65);
    g.fillRect(PANEL_X, PANEL_Y, PANEL_W, 2);
    g.lineStyle(1, PALETTE.steel, 0.24);
    g.lineBetween(PANEL_X + 520, PANEL_Y + 28, PANEL_X + 520, PANEL_Y + PANEL_H - 28);
    this.tweens.add({ targets: g, alpha: 1, duration: 420, delay: 160 });

    this.add
      .text(PANEL_X + 36, PANEL_Y + 22, 'SHIFT REPORT', {
        fontFamily: FONT,
        fontSize: '11px',
        color: CSS.dim,
        letterSpacing: 6,
      })
      .setAlpha(0.8);
  }

  /** Returns the delay at which the last row finishes dealing in. */
  private buildRows(): number {
    const s = this.summary;
    const mm = String(Math.floor(Math.max(0, s.timeSeconds) / 60)).padStart(2, '0');
    const ss = String(Math.floor(Math.max(0, s.timeSeconds) % 60)).padStart(2, '0');

    const rows: Array<[string, string]> = [
      ['SCORE', '0'],
      ['FLOORS CLEARED', `${s.floorsCleared} / ${s.floorCount}`],
      ['PANES CLEANED', String(s.panesCleaned)],
      ['SPOTLESS PANES', String(s.spotless)],
      ['BEST MULTIPLIER', `x${s.bestMultiplier}`],
      ['SHIFT TIME', `${mm}:${ss}`],
    ];

    let last = 0;
    rows.forEach(([label, value], i) => {
      const delay = 420 + i * 150;
      last = delay;
      const y = ROW_TOP + i * ROW_PITCH;

      const rule = this.add.graphics();
      rule.lineStyle(1, PALETTE.steel, 0.16);
      rule.lineBetween(0, 17, ROW_W, 17);

      const key = this.add
        .text(0, 0, label, { fontFamily: FONT, fontSize: '13px', color: CSS.dim, letterSpacing: 3 })
        .setOrigin(0, 0.5);
      const val = this.add
        .text(ROW_W, 0, value, {
          fontFamily: FONT,
          fontSize: '24px',
          color: i === 0 ? CSS.amber : CSS.paper,
          fontStyle: 'bold',
          letterSpacing: 1,
        })
        .setOrigin(1, 0.5);

      const row = this.add.container(ROW_X, y, [rule, key, val]).setAlpha(0);
      this.tweens.add({
        targets: row,
        alpha: 1,
        x: { from: ROW_X - 22, to: ROW_X },
        duration: 340,
        delay,
        ease: 'Quad.Out',
      });

      if (i === 0 && s.score > 0) {
        this.tweens.addCounter({
          from: 0,
          to: s.score,
          duration: 1000,
          delay: delay + 80,
          ease: 'Cubic.Out',
          onUpdate: (tween) => val.setText(String(Math.round(tween.getValue() ?? 0))),
          onComplete: () => val.setText(String(s.score)),
        });
      }
    });
    return last;
  }

  private buildGrade(grade: Grade, delay: number): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 0.92);
    g.fillRoundedRect(-76, -76, 152, 152, 6);
    g.lineStyle(5, grade.color, 1);
    g.strokeRoundedRect(-76, -76, 152, 152, 6);
    g.lineStyle(1, grade.color, 0.45);
    g.strokeRoundedRect(-65, -65, 130, 130, 4);

    const letter = this.add
      .text(0, -6, grade.letter, {
        fontFamily: FONT,
        fontSize: '92px',
        color: grade.css,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);
    const caption = this.add
      .text(0, 52, 'GRADE', { fontFamily: FONT, fontSize: '11px', color: CSS.dim, letterSpacing: 7 })
      .setOrigin(0.5, 0.5);

    const badge = this.add
      .container(BADGE_X, BADGE_Y, [g, letter, caption])
      .setAlpha(0)
      .setScale(3.4)
      .setAngle(-34);

    // Drawn around a local origin so the shockwave scales about the badge.
    const ring = this.add.graphics({ x: BADGE_X, y: BADGE_Y }).setAlpha(0);
    ring.lineStyle(4, grade.color, 1);
    ring.strokeCircle(0, 0, 96);

    const word = this.add
      .text(BADGE_X, BADGE_Y + 104, grade.word, {
        fontFamily: FONT,
        fontSize: '16px',
        color: grade.css,
        fontStyle: 'bold',
        letterSpacing: 5,
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: badge,
      alpha: 1,
      scale: 1,
      angle: -7,
      duration: 340,
      delay,
      ease: 'Expo.Out',
      onComplete: () => {
        this.cameras.main.shake(180, 0.006);
        audio.play(grade.letter === 'S' ? 'sparkle' : grade.letter === 'D' || grade.letter === 'C' ? 'stinger' : 'chime');
        ring.setAlpha(0.85).setScale(0.72);
        this.tweens.add({ targets: ring, alpha: 0, scale: 1.5, duration: 520, ease: 'Quad.Out' });
        this.tweens.add({ targets: word, alpha: 1, y: BADGE_Y + 108, duration: 320, ease: 'Quad.Out' });
      },
    });
  }

  private buildBestLine(delay: number): void {
    const s = this.summary;
    const y = 556;

    if (s.newBest) {
      const label = this.add
        .text(CX, y, 'NEW PERSONAL BEST', {
          fontFamily: FONT,
          fontSize: '26px',
          color: CSS.amber,
          fontStyle: 'bold',
          letterSpacing: 8,
        })
        .setOrigin(0.5, 0.5)
        .setAlpha(0);
      const half = label.width / 2;
      const g = this.add.graphics().setAlpha(0);
      this.hazard(g, CX - half - 112, y - 4, 96, 8, 1);
      this.hazard(g, CX + half + 16, y - 4, 96, 8, -1);
      this.tweens.add({ targets: [g, label], alpha: 1, duration: 360, delay, ease: 'Quad.Out' });
      this.tweens.add({
        targets: label,
        scale: { from: 1, to: 1.045 },
        duration: 780,
        delay: delay + 360,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      this.time.delayedCall(delay, () => audio.play('chime', { volume: 0.7 }));
    } else {
      const label = this.add
        .text(CX, y, `PERSONAL BEST   ${s.bestScore.toLocaleString('en-US')}`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: CSS.dim,
          letterSpacing: 5,
        })
        .setOrigin(0.5, 0.5)
        .setAlpha(0);
      this.tweens.add({ targets: label, alpha: 0.85, duration: 360, delay });
    }
  }

  /* -------------------------------------------------------------- buttons */

  private buildButtons(delay: number): void {
    const make = (x: number, label: string, activate: () => void): void => {
      const base = this.add.graphics();
      base.fillStyle(PALETTE.ink, 0.85);
      base.fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 6);
      base.lineStyle(1.5, PALETTE.steel, 0.5);
      base.strokeRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 6);

      const highlight = this.add.graphics().setAlpha(0);
      highlight.fillStyle(PALETTE.amber, 0.14);
      highlight.fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 6);
      highlight.lineStyle(2, PALETTE.amber, 1);
      highlight.strokeRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 6);
      highlight.fillStyle(PALETTE.amber, 1);
      highlight.fillRect(-BTN_W / 2, -BTN_H / 2, 5, BTN_H);

      const text = this.add
        .text(0, 0, label, {
          fontFamily: FONT,
          fontSize: '20px',
          color: CSS.dim,
          fontStyle: 'bold',
          letterSpacing: 4,
        })
        .setOrigin(0.5, 0.5);

      const root = this.add.container(x, BTN_Y, [base, highlight, text]).setAlpha(0);
      const i = this.entries.length;
      const hit = this.add.rectangle(x, BTN_Y, BTN_W, BTN_H, 0xffffff, 0);
      // Deliberately inert until the button has actually appeared: players
      // click reflexively when a run ends, and this sits under the cursor.
      hit.on('pointerover', () => this.select(i));
      hit.on('pointerdown', () => {
        this.select(i);
        this.activate();
      });

      this.tweens.add({
        targets: root,
        alpha: 1,
        y: { from: BTN_Y + 18, to: BTN_Y },
        duration: 340,
        delay: delay + i * 110,
        ease: 'Back.Out',
        onComplete: () => hit.setInteractive({ useHandCursor: true }),
      });
      this.entries.push({ root, highlight, text, activate });
    };

    make(CX - 188, 'CLOCK BACK IN', () => this.leave('GameScene'));
    make(CX + 188, 'QUIT TO TITLE', () => this.leave('TitleScene'));

    this.add
      .text(CX, BTN_Y + 48, '← → SELECT      ENTER · SPACE  CONFIRM', {
        fontFamily: FONT,
        fontSize: '11px',
        color: CSS.dim,
        letterSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.55);

    this.select(0, true);
  }

  private select(i: number, instant = false): void {
    const next = Phaser.Math.Wrap(i, 0, this.entries.length);
    if (next === this.index && !instant) return;
    this.index = next;

    this.entries.forEach((entry, k) => {
      const on = k === this.index;
      entry.text.setColor(on ? CSS.paper : CSS.dim);
      this.tweens.killTweensOf(entry.highlight);
      if (instant) {
        entry.highlight.setAlpha(on ? 1 : 0);
      } else {
        this.tweens.add({ targets: entry.highlight, alpha: on ? 1 : 0, duration: 150 });
      }
    });
    if (!instant) audio.play('click', { volume: 0.5 });
  }

  private activate(): void {
    if (this.leaving || this.entries.length === 0) return;
    this.entries[this.index].activate();
  }

  private leave(key: string): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.unlock();
    audio.play('confirm');
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key));
  }

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());

    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown', () => audio.unlock());
    onKeyPress(kb, ['LEFT', 'A', 'UP', 'W'], () => this.select(this.index - 1));
    onKeyPress(kb, ['RIGHT', 'D', 'DOWN', 'S'], () => this.select(this.index + 1));
    onKeyPress(kb, ['ENTER', 'SPACE'], () => this.activate());
    onKeyPress(kb, 'ESC', () => this.leave('TitleScene'));
  }

  update(): void {
    this.grain.tilePositionX = (this.grain.tilePositionX + 3) % 128;
    this.grain.tilePositionY = (this.grain.tilePositionY + 2) % 128;
  }
}
