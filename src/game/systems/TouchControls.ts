import Phaser from 'phaser';
import { CSS, DEPTH, FONT, PALETTE, VIEW } from '../config';

type PadAction = 'left' | 'right' | 'crouch' | 'clean' | 'winch' | 'safety' | 'pause';
type Glyph = 'arrowLeft' | 'arrowRight' | 'chevronDown' | 'chevronUp' | 'squeegee' | 'hook' | 'bars';

interface PadSpec {
  action: PadAction;
  glyph: Glyph;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  accent: number;
}

interface Pad {
  spec: PadSpec;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  /**
   * Pointer that currently owns this pad, or null. Storing the id per pad is
   * what makes multi-touch work: CLEAN keeps its own finger while another
   * finger drives the walk pads.
   */
  pointerId: number | null;
}

/** Screen inset for the thumb clusters, in design pixels. */
const EDGE = 28;

const PAD_SPECS: readonly PadSpec[] = [
  // Left thumb: walk pair with the brace pad slung underneath.
  // Placed to clear the HUD, which is a separate scene rendered above this one
  // and would otherwise sit on top of the pads: soap occupies the bottom-left,
  // the safety dial the bottom-right, and the cleanliness bar the bottom centre.
  { action: 'left', glyph: 'arrowLeft', label: '', cx: EDGE + 58, cy: 430, w: 108, h: 108, accent: PALETTE.steel },
  { action: 'right', glyph: 'arrowRight', label: '', cx: EDGE + 176, cy: 430, w: 108, h: 108, accent: PALETTE.steel },
  { action: 'crouch', glyph: 'chevronDown', label: 'CROUCH', cx: EDGE + 117, cy: 540, w: 226, h: 92, accent: PALETTE.steel },

  // Right thumb: the squeegee is the pad you live on, so it gets the mass.
  { action: 'clean', glyph: 'squeegee', label: 'CLEAN', cx: VIEW.W - EDGE - 92, cy: 436, w: 184, h: 184, accent: PALETTE.amber },
  { action: 'winch', glyph: 'chevronUp', label: 'ASCEND', cx: VIEW.W - EDGE - 262, cy: 386, w: 148, h: 88, accent: PALETTE.hiVis },
  { action: 'safety', glyph: 'hook', label: 'SAFETY', cx: VIEW.W - EDGE - 262, cy: 486, w: 148, h: 88, accent: PALETTE.good },

  // Without this a touch player has no way to reach the pause menu at all,
  // and therefore no way to mute, restart or quit mid-run.
  { action: 'pause', glyph: 'bars', label: '', cx: VIEW.W - EDGE - 30, cy: 214, w: 60, h: 60, accent: PALETTE.steelDark },
];

/**
 * On-screen thumb pads for touch play. Kept deliberately dumb: it only tracks
 * pressed state and two rising-edge latches, and InputSystem folds that into
 * the frame's InputIntent.
 */
export class TouchControls {
  public readonly state: {
    left: boolean;
    right: boolean;
    crouch: boolean;
    clean: boolean;
    winch: boolean;
    safety: boolean;
    pause: boolean;
  } = { left: false, right: false, crouch: false, clean: false, winch: false, safety: false, pause: false };

  private readonly pads: Pad[] = [];
  private safetyLatch = false;
  private pauseLatch = false;
  private anyLatch = false;
  private destroyed = false;

  private readonly onGlobalRelease = (pointer: Phaser.Input.Pointer): void => {
    // Belt-and-braces: a pad released off-canvas never gets its own event.
    for (const pad of this.pads) {
      if (pad.pointerId === pointer.id) this.release(pad);
    }
  };

  private readonly onGameOut = (): void => {
    for (const pad of this.pads) this.release(pad);
  };

  constructor(private readonly scene: Phaser.Scene) {
    for (const spec of PAD_SPECS) this.pads.push(this.buildPad(spec));

    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onGlobalRelease);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onGlobalRelease);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.onGameOut);

    this.setVisible(false);
  }

  public consumeSafetyPress(): boolean {
    const pressed = this.safetyLatch;
    this.safetyLatch = false;
    return pressed;
  }

  public consumePausePress(): boolean {
    const pressed = this.pauseLatch;
    this.pauseLatch = false;
    return pressed;
  }

  public consumeAnyPress(): boolean {
    const pressed = this.anyLatch;
    this.anyLatch = false;
    return pressed;
  }

  /**
   * Drop every pad and latch. Pausing the scene stops Phaser delivering input
   * to it, so the pointer-up that would have released the pad never arrives;
   * without this the pad stays owned by a finger that is long gone and
   * silently ignores every later press.
   */
  public releaseAll(): void {
    for (const pad of this.pads) this.release(pad);
    this.safetyLatch = false;
    this.pauseLatch = false;
    this.anyLatch = false;
  }

  public setVisible(visible: boolean): void {
    for (const pad of this.pads) {
      if (!visible) this.release(pad);
      pad.root.setVisible(visible);
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onGlobalRelease);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onGlobalRelease);
    this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.onGameOut);
    for (const pad of this.pads) pad.root.destroy();
    this.pads.length = 0;
  }

  /* ------------------------------------------------------------- building */

  private buildPad(spec: PadSpec): Pad {
    const root = this.scene.add.container(spec.cx, spec.cy);
    root.setSize(spec.w, spec.h);
    root.setScrollFactor(0, 0, true);
    root.setDepth(DEPTH.overlay);
    root.setAlpha(0.9);

    const bg = this.scene.add.graphics();
    root.add(bg);

    const glyph = this.scene.add.graphics();
    this.drawGlyph(glyph, spec);
    root.add(glyph);

    if (spec.label.length > 0) {
      const text = this.scene.add
        .text(0, spec.glyph === 'chevronDown' ? 2 : spec.h / 2 - 22, spec.label, {
          fontFamily: FONT,
          fontSize: spec.w > 150 ? '20px' : '15px',
          fontStyle: 'bold',
          color: CSS.paper,
        })
        .setOrigin(0.5);
      text.setAlpha(0.86);
      root.add(text);
    }

    const pad: Pad = { spec, root, bg, pointerId: null };
    this.drawFace(pad, false);

    root.setInteractive();
    root.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.press(pad, pointer);
    });
    root.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (pad.pointerId === pointer.id) this.release(pad);
    });
    // Sliding a thumb off the pad cancels it, which also stops a stuck hold.
    root.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, (pointer: Phaser.Input.Pointer) => {
      if (pad.pointerId === pointer.id) this.release(pad);
    });

    return pad;
  }

  /* -------------------------------------------------------------- drawing */

  private drawFace(pad: Pad, pressed: boolean): void {
    const { w, h, accent } = pad.spec;
    const x = -w / 2;
    const y = -h / 2;
    const r = Math.min(22, h * 0.28);
    const g = pad.bg;

    g.clear();
    g.fillStyle(pressed ? accent : PALETTE.steelDark, pressed ? 0.5 : 0.24);
    g.fillRoundedRect(x, y, w, h, r);

    // Top-light bevel: cheap way to read as a machined steel button.
    g.fillStyle(PALETTE.steel, pressed ? 0.2 : 0.1);
    g.fillRoundedRect(x + 5, y + 5, w - 10, h * 0.4, Math.max(4, r - 8));

    g.lineStyle(2, accent, pressed ? 1 : 0.5);
    g.strokeRoundedRect(x, y, w, h, r);

    if (pressed) {
      g.lineStyle(6, accent, 0.22);
      g.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, r + 4);
    }
  }

  private drawGlyph(g: Phaser.GameObjects.Graphics, spec: PadSpec): void {
    const labelled = spec.label.length > 0;
    const cy = labelled && spec.glyph !== 'chevronDown' ? -14 : 0;
    g.fillStyle(PALETTE.paper, 0.9);
    g.lineStyle(5, PALETTE.paper, 0.9);

    switch (spec.glyph) {
      case 'arrowLeft':
        g.fillTriangle(-22, 0, 14, -26, 14, 26);
        break;
      case 'arrowRight':
        g.fillTriangle(22, 0, -14, -26, -14, 26);
        break;
      case 'chevronDown':
        g.beginPath();
        g.moveTo(-spec.w / 2 + 30, cy - 9);
        g.lineTo(-spec.w / 2 + 48, cy + 9);
        g.lineTo(-spec.w / 2 + 66, cy - 9);
        g.strokePath();
        break;
      case 'chevronUp':
        g.beginPath();
        g.moveTo(-16, cy + 8);
        g.lineTo(0, cy - 8);
        g.lineTo(16, cy + 8);
        g.strokePath();
        break;
      case 'squeegee':
        // Blade bar plus a raked handle — reads as the tool at thumb size.
        g.fillRoundedRect(-42, cy + 12, 84, 12, 5);
        g.lineStyle(9, PALETTE.paper, 0.9);
        g.beginPath();
        g.moveTo(0, cy + 12);
        g.lineTo(24, cy - 34);
        g.strokePath();
        break;
      case 'bars':
        g.fillStyle(PALETTE.paper, 0.9);
        g.fillRect(-9, cy - 11, 7, 22);
        g.fillRect(2, cy - 11, 7, 22);
        break;
      case 'hook':
        g.lineStyle(5, PALETTE.paper, 0.9);
        g.beginPath();
        g.arc(0, cy, 13, Phaser.Math.DegToRad(-40), Phaser.Math.DegToRad(220), false);
        g.strokePath();
        g.beginPath();
        g.moveTo(0, cy - 13);
        g.lineTo(0, cy - 26);
        g.strokePath();
        break;
    }
  }

  /* --------------------------------------------------------------- state */

  private press(pad: Pad, pointer: Phaser.Input.Pointer): void {
    if (pad.pointerId !== null) return;
    pad.pointerId = pointer.id;
    this.state[pad.spec.action] = true;
    this.anyLatch = true;
    if (pad.spec.action === 'safety') this.safetyLatch = true;
    if (pad.spec.action === 'pause') this.pauseLatch = true;
    pad.root.setScale(0.96);
    this.drawFace(pad, true);
  }

  private release(pad: Pad): void {
    if (pad.pointerId === null) return;
    pad.pointerId = null;
    this.state[pad.spec.action] = false;
    pad.root.setScale(1);
    this.drawFace(pad, false);
  }
}
