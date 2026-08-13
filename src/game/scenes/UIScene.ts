import Phaser from 'phaser';
import { CSS, FLOOR_COUNT, FONT, PALETTE, RULES, SIM, VIEW } from '../config';
import type { HudState, ToastTone } from '../types/GameTypes';

interface ToastPayload {
  text: string;
  tone: ToastTone;
}

interface GrabPayload {
  active: boolean;
  progress: number;
  timeLeft: number;
}

const CX = VIEW.W / 2;
const SAFE = 26;

/* Tilt gauge: a plumb-bob inclinometer hanging from the top of the frame. */
const GAUGE_PIVOT_Y = 40;
const GAUGE_R = 78;
const GAUGE_SPREAD = Phaser.Math.DegToRad(58);
const GAUGE_PLATE_H = 172;
/** Fractions of `dumpAngle` at which the gauge changes colour. */
const CAUTION = 0.4;
const CRITICAL = 0.75;

const HEALTH_SEGMENTS = 10;
const HEALTH_X = SAFE;
const HEALTH_Y = 108;
const HEALTH_SEG_W = 20;
const HEALTH_SEG_H = 12;
const HEALTH_GAP = 4;

const FLOOR_RIGHT = VIEW.W - SAFE;
const FLOOR_STACK_BOTTOM = 176;
const FLOOR_TICK_H = 8;
const FLOOR_TICK_PITCH = 14;

const TANK_X = 30;
const TANK_TOP = 618;
const TANK_W = 44;
const TANK_H = 70;

const SAFETY_X = 1214;
const SAFETY_Y = 646;
const SAFETY_R = 28;

const BAR_LEFT = CX - 230;
const BAR_RIGHT = CX + 230;
const BAR_TOP = 640;
const BAR_H = 18;

const TOAST_Y = 520;
const GRAB_Y = 300;

const TONE_COLOR: Record<ToastTone, { css: string; hex: number }> = {
  info: { css: CSS.paper, hex: PALETTE.steel },
  warn: { css: CSS.danger, hex: PALETTE.danger },
  good: { css: CSS.good, hex: PALETTE.good },
};

const IDLE_HUD: HudState = {
  score: 0,
  multiplier: 1,
  health: RULES.maxHealth,
  maxHealth: RULES.maxHealth,
  floor: 0,
  floorCount: FLOOR_COUNT,
  floorProgress: 0,
  soap: RULES.soapCapacity,
  soapCapacity: RULES.soapCapacity,
  tilt: 0,
  dumpAngle: SIM.dumpAngle,
  safetyCooldown: 0,
  safetyCooldownMax: RULES.safetyLineCooldown,
  winchReady: false,
  wind: 0,
  elapsed: 0,
};

/**
 * The in-game HUD, run as an overlay above GameScene.
 *
 * Every listener is bound to GameScene's own emitter rather than the global
 * game emitter, and torn down on SHUTDOWN: a restart destroys and recreates
 * this scene, and global listeners would otherwise stack up one per run.
 */
export class UIScene extends Phaser.Scene {
  private src!: Phaser.Events.EventEmitter;

  private hud: HudState = { ...IDLE_HUD };
  private grab: GrabPayload = { active: false, progress: 0, timeLeft: 0 };

  /** Smoothed mirrors of the raw state, so readouts glide instead of snapping. */
  private scoreShown = 0;
  private healthShown = 1;
  private progressShown = 0;
  private soapShown = 1;
  private t = 0;
  private damageFlash = 0;
  private lastHealth: number = RULES.maxHealth;
  private lastMultiplier = 1;
  private lastFloor = 0;

  private dyn!: Phaser.GameObjects.Graphics;
  private grabGfx!: Phaser.GameObjects.Graphics;

  private scoreText!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private floorText!: Phaser.GameObjects.Text;
  private tiltText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private soapText!: Phaser.GameObjects.Text;
  private safetyText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;

  private gaugeGlow!: Phaser.GameObjects.Image;
  private safetyGlow!: Phaser.GameObjects.Image;
  private hurtEdge!: Phaser.GameObjects.Image;

  private winch!: Phaser.GameObjects.Container;
  private winchShown = false;

  private toastBox!: Phaser.GameObjects.Container;
  private toastPanel!: Phaser.GameObjects.Rectangle;
  private toastAccent!: Phaser.GameObjects.Rectangle;
  private toastText!: Phaser.GameObjects.Text;
  private toastQueue: ToastPayload[] = [];
  private toastBusy = false;
  private toastTimer?: Phaser.Time.TimerEvent;

  private grabBox!: Phaser.GameObjects.Container;
  private grabDim!: Phaser.GameObjects.Rectangle;
  private grabTitle!: Phaser.GameObjects.Text;
  private grabVisible = false;

  constructor() {
    super('UIScene');
  }

  create(): void {
    this.hud = { ...IDLE_HUD };
    this.grab = { active: false, progress: 0, timeLeft: 0 };
    this.scoreShown = 0;
    this.healthShown = 1;
    this.progressShown = 0;
    this.soapShown = 1;
    this.t = 0;
    this.damageFlash = 0;
    this.lastHealth = RULES.maxHealth;
    this.lastMultiplier = 1;
    this.lastFloor = 0;
    this.toastQueue = [];
    this.toastBusy = false;
    this.winchShown = false;
    this.grabVisible = false;

    this.buildChrome();
    this.buildReadouts();
    this.buildWinchPrompt();
    this.buildToast();
    this.buildGrab();

    this.dyn = this.add.graphics().setDepth(6);
    this.grabGfx = this.add.graphics().setDepth(32);

    this.tweens.add({
      targets: this.children.list.filter((c) => c !== this.grabDim && c !== this.grabBox),
      alpha: { from: 0, to: 1 },
      duration: 420,
      ease: 'Quad.Out',
    });

    this.src = this.scene.get<Phaser.Scene>('GameScene').events;
    this.src.on('hud', this.onHud, this);
    this.src.on('toast', this.onToast, this);
    this.src.on('grab', this.onGrab, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  private teardown(): void {
    this.src.off('hud', this.onHud, this);
    this.src.off('toast', this.onToast, this);
    this.src.off('grab', this.onGrab, this);
    this.toastTimer?.remove();
    this.toastTimer = undefined;
    this.toastQueue.length = 0;
  }

  /* ------------------------------------------------------------- inbound */

  private onHud(state: HudState): void {
    if (state.health < this.lastHealth) this.damageFlash = 1;
    this.lastHealth = state.health;

    if (state.multiplier !== this.lastMultiplier) {
      this.lastMultiplier = state.multiplier;
      this.multText.setScale(1.75);
      this.tweens.add({ targets: this.multText, scale: 1, duration: 380, ease: 'Back.Out' });
    }

    if (state.floor !== this.lastFloor) {
      this.lastFloor = state.floor;
      this.tweens.add({
        targets: this.floorText,
        scale: { from: 1.3, to: 1 },
        duration: 420,
        ease: 'Back.Out',
      });
    }

    if (state.winchReady !== this.winchShown) this.setWinchPrompt(state.winchReady);
    this.hud = state;
  }

  private onToast(payload: ToastPayload): void {
    this.toastQueue.push(payload);
    if (!this.toastBusy) this.nextToast();
  }

  private onGrab(payload: GrabPayload): void {
    this.grab = payload;
    if (payload.active === this.grabVisible) return;
    this.grabVisible = payload.active;

    this.tweens.killTweensOf([this.grabBox, this.grabDim]);
    if (payload.active) {
      this.grabBox.setVisible(true).setAlpha(0).setScale(0.62);
      this.grabDim.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.grabBox, alpha: 1, scale: 1, duration: 260, ease: 'Back.Out' });
      this.tweens.add({ targets: this.grabDim, alpha: 0.34, duration: 200 });
    } else {
      this.tweens.add({
        targets: [this.grabBox, this.grabDim],
        alpha: 0,
        duration: 220,
        ease: 'Quad.In',
        onComplete: () => {
          this.grabBox.setVisible(false);
          this.grabDim.setVisible(false);
        },
      });
    }
  }

  /* --------------------------------------------------------------- build */

  private text(
    x: number,
    y: number,
    content: string,
    size: number,
    color: string,
    spacing = 0,
    bold = false,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, content, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        letterSpacing: spacing,
        fontStyle: bold ? 'bold' : 'normal',
      })
      .setShadow(0, 2, '#00000099', 4, false, true)
      .setDepth(10);
  }

  /**
   * Diagonal hazard banding drawn as stacked slivers. Graphics has no clipping
   * path, and per-row rectangles clamp to the strip far more cheaply than a
   * geometry mask would.
   */
  private hazard(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    dir = 1,
  ): void {
    g.fillStyle(PALETTE.ink, 0.9);
    g.fillRect(x, y, w, h);
    g.fillStyle(PALETTE.amber, 0.9);
    const band = 11;
    const step = 2;
    for (let j = 0; j < h; j += step) {
      const shift = dir * j;
      for (let sx = -band * 3; sx < w + band * 3; sx += band * 2) {
        const px = x + sx + shift;
        const x0 = Math.max(x, px);
        const x1 = Math.min(x + w, px + band);
        if (x1 > x0) g.fillRect(x0, y + j, x1 - x0, Math.min(step, h - j));
      }
    }
  }

  private buildChrome(): void {
    const g = this.add.graphics().setDepth(2);

    // Frame brackets: just enough edge language to read as instrumentation.
    g.lineStyle(2, PALETTE.steel, 0.4);
    const bracket = (x: number, y: number, dx: number, dy: number) => {
      g.beginPath();
      g.moveTo(x + dx * 34, y);
      g.lineTo(x, y);
      g.lineTo(x, y + dy * 34);
      g.strokePath();
    };
    bracket(12, 12, 1, 1);
    bracket(VIEW.W - 12, 12, -1, 1);
    bracket(12, VIEW.H - 12, 1, -1);
    bracket(VIEW.W - 12, VIEW.H - 12, -1, -1);

    // Score block spine.
    g.fillStyle(PALETTE.amber, 0.85);
    g.fillRect(16, 20, 4, 104);

    // Tilt gauge housing.
    g.fillStyle(PALETTE.ink, 0.42);
    g.fillRoundedRect(CX - 152, 2, 304, GAUGE_PLATE_H, 10);
    g.lineStyle(1, PALETTE.steel, 0.34);
    g.strokeRoundedRect(CX - 152, 2, 304, GAUGE_PLATE_H, 10);
    g.fillStyle(PALETTE.amber, 0.7);
    g.fillRect(CX - 152, 2, 304, 2);
    this.hazard(g, CX - 152, GAUGE_PLATE_H - 6, 54, 8, 1);
    this.hazard(g, CX + 98, GAUGE_PLATE_H - 6, 54, 8, -1);

    // Floor spine.
    g.fillStyle(PALETTE.steelDark, 0.7);
    g.fillRect(FLOOR_RIGHT + 2, FLOOR_STACK_BOTTOM - FLOOR_COUNT * FLOOR_TICK_PITCH, 3, FLOOR_COUNT * FLOOR_TICK_PITCH);

    // Bottom hazard accents beneath the consumable readouts.
    this.hazard(g, SAFE, VIEW.H - 20, 192, 8, 1);
    this.hazard(g, VIEW.W - SAFE - 148, VIEW.H - 20, 148, 8, -1);

    // Hairline rules tying the bottom cluster together.
    g.lineStyle(1, PALETTE.steel, 0.22);
    g.lineBetween(SAFE, 606, 236, 606);
    g.lineBetween(BAR_LEFT, 616, BAR_RIGHT, 616);
    g.lineBetween(VIEW.W - SAFE - 200, 606, VIEW.W - SAFE, 606);

    this.gaugeGlow = this.add
      .image(CX, GAUGE_PIVOT_Y + 40, 'glow')
      .setDisplaySize(340, 240)
      .setTint(PALETTE.danger)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setDepth(3);

    this.safetyGlow = this.add
      .image(SAFETY_X, SAFETY_Y, 'glow')
      .setDisplaySize(140, 140)
      .setTint(PALETTE.amber)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setDepth(3);

    this.hurtEdge = this.add
      .image(CX, VIEW.H / 2, 'vignette')
      .setDisplaySize(VIEW.W, VIEW.H)
      .setTint(PALETTE.danger)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setDepth(4);
  }

  private buildReadouts(): void {
    this.text(SAFE, 20, 'SHIFT SCORE', 10, CSS.dim, 4);

    // Odometer ghost: unlit leading zeros behind the live figure.
    this.add
      .text(SAFE, 34, '000000', {
        fontFamily: FONT,
        fontSize: '46px',
        color: CSS.dim,
        // Must match the live figure's weight or the glyph advances differ and
        // the right-aligned digits stop lining up.
        fontStyle: 'bold',
        fixedWidth: 200,
        align: 'right',
      })
      .setAlpha(0.13)
      .setDepth(9);
    this.scoreText = this.add
      .text(SAFE, 34, '0', {
        fontFamily: FONT,
        fontSize: '46px',
        color: CSS.amber,
        fontStyle: 'bold',
        fixedWidth: 200,
        align: 'right',
      })
      .setShadow(0, 3, '#000000aa', 6, false, true)
      .setDepth(10);

    this.multText = this.text(238, 62, 'x1', 28, CSS.paper, 1, true).setOrigin(0, 0.5);
    this.multText.setColor('#d9f24e');

    this.text(SAFE, 90, 'INTEGRITY', 10, CSS.dim, 4);

    this.text(FLOOR_RIGHT, 18, 'FLOOR', 10, CSS.dim, 5).setOrigin(1, 0);
    this.floorText = this.text(FLOOR_RIGHT, 30, '01 / 08', 24, CSS.amber, 2, true).setOrigin(1, 0);

    this.text(CX, 10, 'RIG TILT', 10, CSS.dim, 5).setOrigin(0.5, 0);
    this.tiltText = this.text(CX, 130, '0.0°', 15, CSS.good, 2, true).setOrigin(0.5, 0);
    this.clockText = this.text(CX, 152, 'SHIFT 00:00', 12, CSS.dim, 3).setOrigin(0.5, 0);

    this.text(88, 616, 'SOAP', 10, CSS.dim, 4);
    this.soapText = this.text(88, 654, '100%', 12, CSS.paper, 2, true);

    this.text(SAFETY_X, 686, 'SAFETY · SHIFT', 9, CSS.dim, 3).setOrigin(0.5, 0);
    this.safetyText = this.text(SAFETY_X, SAFETY_Y, 'READY', 12, CSS.amber, 1, true).setOrigin(0.5, 0.5);

    this.text(BAR_LEFT, 620, 'FLOOR CLEANLINESS', 10, CSS.dim, 3);
    this.progressText = this.text(BAR_RIGHT, 618, '0%', 13, CSS.amber, 1, true).setOrigin(1, 0);
    this.text(BAR_LEFT + 460 * RULES.floorTarget, BAR_TOP + BAR_H + 4, 'TARGET', 8, CSS.dim, 2).setOrigin(0.5, 0);
    this.text(CX, 576, 'WIND', 9, CSS.dim, 4).setOrigin(0.5, 0);
  }

  private buildWinchPrompt(): void {
    const w = 232;
    const h = 40;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.ink, 0.86);
    g.fillRoundedRect(-w, -h / 2, w, h, 6);
    g.lineStyle(1.5, PALETTE.amber, 0.9);
    g.strokeRoundedRect(-w, -h / 2, w, h, 6);
    this.hazard(g, -w + 6, h / 2 - 12, 26, 8, 1);

    const label = this.add
      .text(-w + 44, 0, 'HOLD W — ASCEND', {
        fontFamily: FONT,
        fontSize: '15px',
        color: CSS.amber,
        fontStyle: 'bold',
        letterSpacing: 2,
      })
      .setOrigin(0, 0.5);

    const arrow = this.add.graphics();
    arrow.lineStyle(3, PALETTE.hiVis, 1);
    for (let i = 0; i < 2; i++) {
      const oy = i * 9;
      arrow.beginPath();
      arrow.moveTo(-w + 20, 4 + oy);
      arrow.lineTo(-w + 27, -4 + oy);
      arrow.lineTo(-w + 34, 4 + oy);
      arrow.strokePath();
    }

    this.winch = this.add
      .container(FLOOR_RIGHT, 580, [g, label, arrow])
      .setDepth(12)
      .setVisible(false)
      .setAlpha(0);

    // The chevrons crawl upward to read as "keep holding", not "tap".
    this.tweens.add({
      targets: arrow,
      y: -7,
      alpha: { from: 1, to: 0.15 },
      duration: 760,
      repeat: -1,
      ease: 'Sine.Out',
    });
  }

  private setWinchPrompt(ready: boolean): void {
    this.winchShown = ready;
    this.tweens.killTweensOf(this.winch);
    if (ready) {
      this.winch.setVisible(true).setAlpha(0).setX(FLOOR_RIGHT + 70);
      this.tweens.add({ targets: this.winch, x: FLOOR_RIGHT, alpha: 1, duration: 340, ease: 'Back.Out' });
    } else {
      this.tweens.add({
        targets: this.winch,
        x: FLOOR_RIGHT + 70,
        alpha: 0,
        duration: 220,
        ease: 'Quad.In',
        onComplete: () => this.winch.setVisible(false),
      });
    }
  }

  private buildToast(): void {
    this.toastPanel = this.add.rectangle(0, 0, 320, 46, PALETTE.ink, 0.88).setStrokeStyle(1, PALETTE.steel, 0.45);
    this.toastAccent = this.add.rectangle(-158, 0, 4, 46, PALETTE.amber, 1);
    this.toastText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '17px',
        color: CSS.paper,
        letterSpacing: 1,
      })
      .setOrigin(0.5, 0.5);

    this.toastBox = this.add
      .container(CX, TOAST_Y, [this.toastPanel, this.toastAccent, this.toastText])
      .setDepth(20)
      .setVisible(false)
      .setAlpha(0);
  }

  private nextToast(): void {
    const next = this.toastQueue.shift();
    if (!next) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;

    const tone = TONE_COLOR[next.tone];
    this.toastText.setText(next.text).setColor(tone.css);
    const w = Math.max(300, this.toastText.width + 78);
    this.toastPanel.setSize(w, 46);
    this.toastAccent.setSize(4, 46).setFillStyle(tone.hex, 1);
    this.toastAccent.x = -w / 2 + 2;
    this.toastText.x = 10;
    this.toastPanel.setStrokeStyle(1, tone.hex, 0.55);

    this.toastBox.setVisible(true).setAlpha(0).setY(TOAST_Y + 18);
    this.tweens.add({
      targets: this.toastBox,
      alpha: 1,
      y: TOAST_Y,
      duration: 240,
      ease: 'Back.Out',
    });

    this.toastTimer = this.time.delayedCall(2800, () => {
      this.tweens.add({
        targets: this.toastBox,
        alpha: 0,
        y: TOAST_Y - 16,
        duration: 260,
        ease: 'Quad.In',
        onComplete: () => {
          this.toastBox.setVisible(false);
          this.nextToast();
        },
      });
    });
  }

  private buildGrab(): void {
    this.grabDim = this.add
      .rectangle(CX, VIEW.H / 2, VIEW.W, VIEW.H, PALETTE.ink, 1)
      .setDepth(30)
      .setVisible(false)
      .setAlpha(0);

    this.grabTitle = this.add
      .text(0, 0, 'MASH SPACE', {
        fontFamily: FONT,
        fontSize: '62px',
        color: CSS.danger,
        fontStyle: 'bold',
        letterSpacing: 8,
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#080b12', 8)
      .setShadow(0, 4, '#000000cc', 10, true, true);

    const sub = this.add
      .text(0, 52, 'HAUL YOURSELF BACK ONTO THE RIG', {
        fontFamily: FONT,
        fontSize: '15px',
        color: CSS.paper,
        letterSpacing: 5,
      })
      .setOrigin(0.5, 0.5);

    this.grabBox = this.add
      .container(CX, GRAB_Y, [this.grabTitle, sub])
      .setDepth(34)
      .setVisible(false)
      .setAlpha(0);
  }

  /* -------------------------------------------------------------- render */

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    this.t += dt;

    const ease = 1 - Math.pow(0.0016, dt);
    this.scoreShown = Phaser.Math.Linear(this.scoreShown, this.hud.score, 1 - Math.pow(0.0009, dt));
    if (Math.abs(this.hud.score - this.scoreShown) < 0.6) this.scoreShown = this.hud.score;
    this.healthShown = Phaser.Math.Linear(this.healthShown, this.ratio(this.hud.health, this.hud.maxHealth), ease);
    this.progressShown = Phaser.Math.Linear(this.progressShown, Phaser.Math.Clamp(this.hud.floorProgress, 0, 1), ease);
    this.soapShown = Phaser.Math.Linear(this.soapShown, this.ratio(this.hud.soap, this.hud.soapCapacity), ease);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);

    const g = this.dyn;
    g.clear();
    this.drawHealth(g);
    this.drawGauge(g);
    this.drawFloors(g);
    this.drawSoap(g);
    this.drawSafety(g);
    this.drawProgress(g);
    this.drawWind(g);
    this.drawGrab();
    this.syncText();

    this.hurtEdge.setAlpha(this.damageFlash * 0.5);
  }

  private ratio(value: number, max: number): number {
    return max > 0 ? Phaser.Math.Clamp(value / max, 0, 1) : 0;
  }

  private tiltRatio(): number {
    const dump = Math.max(0.05, this.hud.dumpAngle);
    return Phaser.Math.Clamp(this.hud.tilt / dump, -1, 1);
  }

  private zoneColor(mag: number): number {
    if (mag >= CRITICAL) return PALETTE.danger;
    if (mag >= CAUTION) return PALETTE.amber;
    return PALETTE.good;
  }

  private syncText(): void {
    this.scoreText.setText(String(Math.round(this.scoreShown)));
    this.multText.setText(`x${this.hud.multiplier}`);
    this.multText.setColor(this.hud.multiplier > 1 ? '#d9f24e' : CSS.dim);

    const floor = Phaser.Math.Clamp(this.hud.floor + 1, 1, FLOOR_COUNT);
    this.floorText.setText(`${String(floor).padStart(2, '0')} / ${String(FLOOR_COUNT).padStart(2, '0')}`);

    const deg = Phaser.Math.RadToDeg(this.hud.tilt);
    const mag = Math.abs(this.tiltRatio());
    this.tiltText.setText(`${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1)}°`);
    this.tiltText.setColor(mag >= CRITICAL ? CSS.danger : mag >= CAUTION ? CSS.amber : CSS.good);

    const total = Math.max(0, Math.floor(this.hud.elapsed));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    this.clockText.setText(`SHIFT ${mm}:${ss}`);

    const dry = this.hud.soap <= 0.02;
    this.soapText.setText(dry ? 'DRY' : `${Math.round(this.soapShown * 100)}%`);
    this.soapText.setColor(dry ? CSS.danger : CSS.paper);
    this.soapText.setAlpha(dry ? 0.55 + 0.45 * Math.sin(this.t * 9) : 1);

    const ready = this.hud.safetyCooldown <= 0.01;
    this.safetyText.setText(ready ? 'READY' : this.hud.safetyCooldown.toFixed(1));
    this.safetyText.setColor(ready ? CSS.amber : CSS.dim);

    this.progressText.setText(`${Math.round(this.progressShown * 100)}%`);
    this.progressText.setColor(this.progressShown >= RULES.floorTarget ? CSS.good : CSS.amber);
  }

  private drawHealth(g: Phaser.GameObjects.Graphics): void {
    const r = this.healthShown;
    const color = r > 0.55 ? PALETTE.good : r > 0.28 ? PALETTE.amber : PALETTE.danger;
    const filled = r * HEALTH_SEGMENTS;
    const critPulse = r <= 0.28 ? 0.55 + 0.45 * Math.sin(this.t * 8) : 1;

    for (let i = 0; i < HEALTH_SEGMENTS; i++) {
      const x = HEALTH_X + i * (HEALTH_SEG_W + HEALTH_GAP);
      g.fillStyle(PALETTE.concreteDark, 0.72);
      g.fillRect(x, HEALTH_Y, HEALTH_SEG_W, HEALTH_SEG_H);
      g.lineStyle(1, PALETTE.steel, 0.3);
      g.strokeRect(x + 0.5, HEALTH_Y + 0.5, HEALTH_SEG_W - 1, HEALTH_SEG_H - 1);

      const fill = Phaser.Math.Clamp(filled - i, 0, 1);
      if (fill <= 0) continue;
      g.fillStyle(color, critPulse);
      g.fillRect(x + 1, HEALTH_Y + 1, (HEALTH_SEG_W - 2) * fill, HEALTH_SEG_H - 2);
      // Specular sliver so the bar reads as lit glass rather than flat paint.
      g.fillStyle(0xffffff, 0.18 * critPulse);
      g.fillRect(x + 1, HEALTH_Y + 1, (HEALTH_SEG_W - 2) * fill, 2);
    }

    if (this.damageFlash > 0) {
      g.fillStyle(PALETTE.danger, this.damageFlash * 0.35);
      g.fillRect(HEALTH_X - 3, HEALTH_Y - 3, HEALTH_SEGMENTS * (HEALTH_SEG_W + HEALTH_GAP) - HEALTH_GAP + 6, HEALTH_SEG_H + 6);
    }
  }

  private drawGauge(g: Phaser.GameObjects.Graphics): void {
    const ratio = this.tiltRatio();
    const mag = Math.abs(ratio);
    const cy = GAUGE_PIVOT_Y;
    const mid = Math.PI / 2;

    const band = (from: number, to: number, color: number, alpha: number) => {
      g.lineStyle(11, color, alpha);
      g.beginPath();
      g.arc(CX, cy, GAUGE_R, mid + from * GAUGE_SPREAD, mid + to * GAUGE_SPREAD);
      g.strokePath();
    };

    const live = (lo: number, hi: number) => (mag >= lo && mag < hi ? 0.95 : 0.3);
    band(-CAUTION, CAUTION, PALETTE.good, live(0, CAUTION));
    band(-CRITICAL, -CAUTION, PALETTE.amber, live(CAUTION, CRITICAL));
    band(CAUTION, CRITICAL, PALETTE.amber, live(CAUTION, CRITICAL));
    band(-1, -CRITICAL, PALETTE.danger, live(CRITICAL, 2));
    band(CRITICAL, 1, PALETTE.danger, live(CRITICAL, 2));

    // Graduations every 10% of dump angle, laid inside the band so nothing
    // reaches down into the degrees readout below the dial.
    for (let i = -10; i <= 10; i++) {
      if (i === 0) continue;
      const a = mid + (i / 10) * GAUGE_SPREAD;
      const major = i % 5 === 0;
      const r0 = GAUGE_R - 9;
      const r1 = r0 - (major ? 12 : 6);
      g.lineStyle(major ? 2 : 1, PALETTE.steel, major ? 0.75 : 0.4);
      g.lineBetween(CX + Math.cos(a) * r0, cy + Math.sin(a) * r0, CX + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    // Level reference: a brighter index pointing out at the middle of the band.
    g.lineStyle(2, PALETTE.paper, 0.9);
    g.lineBetween(CX, cy + GAUGE_R - 32, CX, cy + GAUGE_R - 18);
    g.fillStyle(PALETTE.paper, 0.9);
    g.fillTriangle(CX - 5, cy + GAUGE_R - 17, CX + 5, cy + GAUGE_R - 17, CX, cy + GAUGE_R - 9);

    // Needle. Shake scales with how far past the critical threshold we are.
    const shake = mag >= CRITICAL ? Math.sin(this.t * 46) * 0.026 * ((mag - CRITICAL) / (1 - CRITICAL)) : 0;
    const a = mid + ratio * GAUGE_SPREAD + shake;
    const color = this.zoneColor(mag);
    g.lineStyle(4, color, 1);
    g.lineBetween(
      CX - Math.cos(a) * 14,
      cy - Math.sin(a) * 14,
      CX + Math.cos(a) * (GAUGE_R - 6),
      cy + Math.sin(a) * (GAUGE_R - 6),
    );
    g.fillStyle(PALETTE.concreteDark, 1);
    g.fillCircle(CX, cy, 9);
    g.lineStyle(2, color, 1);
    g.strokeCircle(CX, cy, 9);

    if (mag >= CRITICAL) {
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(this.t * 11));
      g.lineStyle(2, PALETTE.danger, pulse);
      g.strokeRoundedRect(CX - 152, 2, 304, GAUGE_PLATE_H, 10);
      this.gaugeGlow.setAlpha(pulse * 0.4 * ((mag - CRITICAL) / (1 - CRITICAL) + 0.3));
    } else {
      this.gaugeGlow.setAlpha(0);
    }
  }

  private drawFloors(g: Phaser.GameObjects.Graphics): void {
    const current = Phaser.Math.Clamp(this.hud.floor, 0, FLOOR_COUNT - 1);
    for (let i = 0; i < FLOOR_COUNT; i++) {
      const y = FLOOR_STACK_BOTTOM - FLOOR_TICK_H - i * FLOOR_TICK_PITCH;
      const done = i < current;
      const here = i === current;
      const w = here ? 62 : done ? 44 : 30;
      const x = FLOOR_RIGHT - w;

      if (here) {
        const pulse = 0.65 + 0.35 * Math.sin(this.t * 4);
        g.fillStyle(PALETTE.amber, pulse);
        g.fillRect(x, y, w, FLOOR_TICK_H);
        g.fillStyle(PALETTE.amber, pulse * 0.28);
        g.fillRect(x - 8, y - 2, w + 8, FLOOR_TICK_H + 4);
      } else if (done) {
        g.fillStyle(PALETTE.good, 0.8);
        g.fillRect(x, y, w, FLOOR_TICK_H);
      } else {
        g.fillStyle(PALETTE.steel, 0.14);
        g.fillRect(x, y, w, FLOOR_TICK_H);
        g.lineStyle(1, PALETTE.steel, 0.38);
        g.strokeRect(x + 0.5, y + 0.5, w - 1, FLOOR_TICK_H - 1);
      }
    }
  }

  private drawSoap(g: Phaser.GameObjects.Graphics): void {
    const r = this.soapShown;
    const dry = this.hud.soap <= 0.02;
    const outline = dry ? PALETTE.danger : PALETTE.steel;
    const alpha = dry ? 0.55 + 0.45 * Math.sin(this.t * 9) : 0.85;

    // Cap and handle.
    g.fillStyle(PALETTE.steelDark, 0.9);
    g.fillRect(TANK_X + 12, TANK_TOP - 8, 20, 8);
    g.fillStyle(PALETTE.ink, 0.7);
    g.fillRoundedRect(TANK_X, TANK_TOP, TANK_W, TANK_H, 5);

    const innerH = TANK_H - 8;
    const fillH = innerH * r;
    if (fillH > 1) {
      g.fillStyle(dry ? PALETTE.danger : 0x4fb6d8, 0.8);
      g.fillRect(TANK_X + 4, TANK_TOP + 4 + (innerH - fillH), TANK_W - 8, fillH);
      // Sloshing meniscus, driven by the same clock as the rig sway.
      const wobble = Math.sin(this.t * 3.1) * 2;
      g.fillStyle(0xa9e6ff, 0.75);
      g.fillRect(TANK_X + 4, TANK_TOP + 4 + (innerH - fillH) + wobble, TANK_W - 8, 2);
    }
    g.lineStyle(2, outline, alpha);
    g.strokeRoundedRect(TANK_X, TANK_TOP, TANK_W, TANK_H, 5);
    g.lineStyle(1, PALETTE.steel, 0.3);
    for (let i = 1; i < 4; i++) {
      const y = TANK_TOP + 4 + (innerH * i) / 4;
      g.lineBetween(TANK_X + TANK_W - 14, y, TANK_X + TANK_W - 4, y);
    }

    // Companion strip readout, easier to parse at a glance than the tank.
    const bx = 88;
    const by = 634;
    const bw = 130;
    g.fillStyle(PALETTE.ink, 0.65);
    g.fillRect(bx, by, bw, 12);
    g.fillStyle(dry ? PALETTE.danger : PALETTE.amber, dry ? alpha : 0.9);
    g.fillRect(bx, by, bw * r, 12);
    g.lineStyle(1, outline, dry ? alpha : 0.45);
    g.strokeRect(bx + 0.5, by + 0.5, bw - 1, 11);
    g.lineStyle(1, PALETTE.ink, 0.6);
    for (let i = 1; i < 5; i++) g.lineBetween(bx + (bw * i) / 5, by, bx + (bw * i) / 5, by + 12);
  }

  private drawSafety(g: Phaser.GameObjects.Graphics): void {
    const max = Math.max(0.001, this.hud.safetyCooldownMax);
    const charged = Phaser.Math.Clamp(1 - this.hud.safetyCooldown / max, 0, 1);
    const ready = this.hud.safetyCooldown <= 0.01;
    const start = -Math.PI / 2;

    g.lineStyle(9, PALETTE.concreteDark, 0.9);
    g.strokeCircle(SAFETY_X, SAFETY_Y, SAFETY_R);
    g.lineStyle(1, PALETTE.steel, 0.35);
    g.strokeCircle(SAFETY_X, SAFETY_Y, SAFETY_R + 6);

    if (charged > 0.001) {
      g.lineStyle(9, ready ? PALETTE.amber : PALETTE.steel, ready ? 1 : 0.8);
      g.beginPath();
      g.arc(SAFETY_X, SAFETY_Y, SAFETY_R, start, start + Math.PI * 2 * charged);
      g.strokePath();
    }

    if (ready) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.4);
      g.lineStyle(2, PALETTE.amber, 0.18 + pulse * 0.4);
      g.strokeCircle(SAFETY_X, SAFETY_Y, SAFETY_R + 10 + pulse * 3);
      this.safetyGlow.setAlpha(0.1 + pulse * 0.14);
    } else {
      this.safetyGlow.setAlpha(0);
    }

    // Hour ticks give the dial a mechanical, gauge-like face.
    g.lineStyle(1, PALETTE.steel, 0.4);
    for (let i = 0; i < 12; i++) {
      const a = start + (i / 12) * Math.PI * 2;
      g.lineBetween(
        SAFETY_X + Math.cos(a) * (SAFETY_R + 7),
        SAFETY_Y + Math.sin(a) * (SAFETY_R + 7),
        SAFETY_X + Math.cos(a) * (SAFETY_R + 11),
        SAFETY_Y + Math.sin(a) * (SAFETY_R + 11),
      );
    }
  }

  private drawProgress(g: Phaser.GameObjects.Graphics): void {
    const w = BAR_RIGHT - BAR_LEFT;
    const p = this.progressShown;
    const met = p >= RULES.floorTarget;

    g.fillStyle(PALETTE.ink, 0.7);
    g.fillRect(BAR_LEFT, BAR_TOP, w, BAR_H);
    g.fillStyle(met ? PALETTE.good : PALETTE.amber, 0.92);
    g.fillRect(BAR_LEFT, BAR_TOP, w * p, BAR_H);
    g.fillStyle(0xffffff, 0.16);
    g.fillRect(BAR_LEFT, BAR_TOP, w * p, 3);

    g.lineStyle(1, PALETTE.ink, 0.55);
    for (let i = 1; i < 10; i++) {
      const x = BAR_LEFT + (w * i) / 10;
      g.lineBetween(x, BAR_TOP, x, BAR_TOP + BAR_H);
    }
    g.lineStyle(1, PALETTE.steel, 0.5);
    g.strokeRect(BAR_LEFT + 0.5, BAR_TOP + 0.5, w - 1, BAR_H - 1);

    // Unlock threshold: the number that actually gates the winch.
    const tx = BAR_LEFT + w * RULES.floorTarget;
    const glow = met ? 0.6 + 0.4 * Math.sin(this.t * 5) : 1;
    g.lineStyle(2, met ? PALETTE.good : PALETTE.paper, glow);
    g.lineBetween(tx, BAR_TOP - 5, tx, BAR_TOP + BAR_H + 5);
    g.fillStyle(met ? PALETTE.good : PALETTE.paper, glow);
    g.fillTriangle(tx - 5, BAR_TOP - 6, tx + 5, BAR_TOP - 6, tx, BAR_TOP - 1);
  }

  private drawWind(g: Phaser.GameObjects.Graphics): void {
    const wind = Phaser.Math.Clamp(this.hud.wind, -1, 1);
    const mag = Math.abs(wind);
    const dir = wind >= 0 ? 1 : -1;
    const y = 598;

    // Travelling wave rather than sliding geometry: the chevrons stay on their
    // graduations while the highlight runs outward, so direction reads without
    // anything visibly snapping back at the end of a cycle.
    for (let i = 0; i < 5; i++) {
      const lit = mag > (i + 0.35) / 5;
      const wave = 0.5 + 0.5 * Math.sin(this.t * (2.4 + mag * 7) - i * 0.85);
      const x = CX + dir * (26 + i * 20) + dir * wave * mag * 3;
      const alpha = lit ? 0.3 + mag * 0.45 + wave * 0.25 : 0.12;
      g.lineStyle(lit ? 3 : 2, lit ? PALETTE.hiVis : PALETTE.steel, alpha);
      g.beginPath();
      g.moveTo(x - dir * 6, y - 7);
      g.lineTo(x + dir * 5, y);
      g.lineTo(x - dir * 6, y + 7);
      g.strokePath();
    }
    // Opposing side stays as faint ghosts so the axis is always legible.
    for (let i = 0; i < 5; i++) {
      const x = CX - dir * (26 + i * 20);
      g.lineStyle(2, PALETTE.steel, 0.1);
      g.beginPath();
      g.moveTo(x + dir * 6, y - 7);
      g.lineTo(x - dir * 5, y);
      g.lineTo(x + dir * 6, y + 7);
      g.strokePath();
    }
  }

  private drawGrab(): void {
    const g = this.grabGfx;
    g.clear();
    if (!this.grabVisible && this.grabBox.alpha <= 0.01) return;

    const a = this.grabBox.alpha;
    const s = this.grabBox.scale;
    const frac = Phaser.Math.Clamp(this.grab.timeLeft / RULES.grabWindow, 0, 1);
    const progress = Phaser.Math.Clamp(this.grab.progress, 0, 1);
    const urgency = 1 - frac;
    const r = 128 * s;

    // Draining timer ring.
    g.lineStyle(13 * s, PALETTE.concreteDark, 0.85 * a);
    g.strokeCircle(CX, GRAB_Y, r);
    g.lineStyle(13 * s, PALETTE.danger, a);
    g.beginPath();
    g.arc(CX, GRAB_Y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    g.strokePath();

    const flare = 0.4 + 0.6 * Math.abs(Math.sin(this.t * (7 + urgency * 12)));
    g.lineStyle(2, PALETTE.danger, a * flare * 0.7);
    g.strokeCircle(CX, GRAB_Y, r + 12 + urgency * 8);

    // Tap progress: one notch per required tap, so effort reads as measurable.
    const bw = 340 * s;
    const bh = 22 * s;
    const bx = CX - bw / 2;
    const by = GRAB_Y + 128 * s;
    g.fillStyle(PALETTE.ink, 0.9 * a);
    g.fillRect(bx, by, bw, bh);
    g.fillStyle(PALETTE.hiVis, a);
    g.fillRect(bx, by, bw * progress, bh);
    g.lineStyle(1, PALETTE.ink, 0.7 * a);
    for (let i = 1; i < RULES.grabTaps; i++) {
      const x = bx + (bw * i) / RULES.grabTaps;
      g.lineBetween(x, by, x, by + bh);
    }
    g.lineStyle(2, PALETTE.paper, 0.8 * a);
    g.strokeRect(bx, by, bw, bh);

    this.grabTitle.setScale(1 + 0.06 * Math.sin(this.t * (12 + urgency * 14)));
    this.grabTitle.setColor(Math.sin(this.t * 18) > 0 || urgency < 0.5 ? CSS.danger : CSS.paper);
  }
}
