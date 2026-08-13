import Phaser from 'phaser';
import { ALL_KEYS, Controls } from '../config';
import { InputIntent } from '../types/GameTypes';
import { TouchControls } from './TouchControls';

/** KeyCodes is a fixed lookup table; index it by name without widening to any. */
const KEY_CODES = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number | undefined>;

/** Pen counts as touch: it is a finger for our purposes and never has buttons. */
const isTouchLike = (pointer: Phaser.Input.Pointer): boolean => {
  if (pointer.wasTouch) return true;
  const event = pointer.event;
  if (typeof PointerEvent === 'undefined' || !(event instanceof PointerEvent)) return false;
  return event.pointerType === 'touch' || event.pointerType === 'pen';
};

/**
 * Single source of truth for player intent. Everything downstream reads the
 * struct returned by getIntent(), which is sampled exactly once per frame —
 * all rising edges are latched here and cleared on read, so a held button can
 * never masquerade as a repeated press.
 */
export class InputSystem {
  private readonly keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null;
  private readonly touch: TouchControls;

  private touchSeen = false;
  private destroyed = false;

  /** Previous polled states, so pointer buttons report edges and not holds. */
  private prevMouseLeft = false;
  private prevMouseRight = false;

  /** Event-side latches, for clicks that start and end between two frames. */
  private mouseLeftLatch = false;
  private mouseRightLatch = false;

  /** Frame-sampled press times for the touch walk pads (0 = not held). */
  private touchLeftSince = 0;
  private touchRightSince = 0;

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (isTouchLike(pointer)) {
      this.revealTouchControls();
      return;
    }
    if (pointer.leftButtonDown()) this.mouseLeftLatch = true;
    if (pointer.rightButtonDown()) this.mouseRightLatch = true;
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (isTouchLike(pointer)) this.revealTouchControls();
  };

  constructor(private readonly scene: Phaser.Scene) {
    // Keyboard is optional: on a phone there simply isn't one, and the game
    // must still be playable through the touch pads.
    this.keyboard = scene.input.keyboard ?? null;
    if (this.keyboard) {
      for (const name of ALL_KEYS) {
        if (this.keys.has(name)) continue;
        const code = KEY_CODES[name];
        if (code === undefined) continue;
        this.keys.set(name, this.keyboard.addKey(code));
      }
    }

    this.touch = new TouchControls(scene);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
  }

  public get touchActive(): boolean {
    return this.touchSeen;
  }

  public getIntent(): InputIntent {
    const pads = this.touch.state;

    if (!this.touchSeen && this.scene.input.activePointer.wasTouch) this.revealTouchControls();

    /* ------------------------------------------------------ pointer edges */

    const mouse: Phaser.Input.Pointer | null = this.scene.input.mousePointer;
    const usableMouse = mouse !== null && !mouse.wasTouch;
    const mouseLeft = usableMouse && mouse.leftButtonDown();
    const mouseRight = usableMouse && mouse.rightButtonDown();

    const mouseLeftEdge = (mouseLeft && !this.prevMouseLeft) || this.mouseLeftLatch;
    const mouseRightEdge = (mouseRight && !this.prevMouseRight) || this.mouseRightLatch;
    this.prevMouseLeft = mouseLeft;
    this.prevMouseRight = mouseRight;
    this.mouseLeftLatch = false;
    this.mouseRightLatch = false;

    /* ----------------------------------------------------- keyboard edges */

    // Each group is polled exactly once: JustDown consumes the flag, so a
    // second call in the same frame would silently swallow the press.
    const cleanEdge = this.justDown(Controls.clean);
    const crouchEdge = this.justDown(Controls.crouch);
    const safetyKeyEdge = this.justDown(Controls.safety);
    const pauseEdge = this.justDown(Controls.pause);
    const muteEdge = this.justDown(Controls.mute);

    const padAny = this.touch.consumeAnyPress();
    const padSafety = this.touch.consumeSafetyPress();

    /* -------------------------------------------------------------- move */

    const now = this.scene.time.now;
    this.touchLeftSince = pads.left ? this.touchLeftSince || now : 0;
    this.touchRightSince = pads.right ? this.touchRightSince || now : 0;

    const leftSince = Math.max(this.heldSince(Controls.left), this.touchLeftSince);
    const rightSince = Math.max(this.heldSince(Controls.right), this.touchRightSince);
    // Newest press wins so a stab in the other direction reverses immediately
    // instead of cancelling out while the first key is still down.
    let move: -1 | 0 | 1 = 0;
    if (leftSince > 0 && rightSince > 0) move = leftSince >= rightSince ? -1 : 1;
    else if (leftSince > 0) move = -1;
    else if (rightSince > 0) move = 1;

    return {
      move,
      crouchHeld: this.anyDown(Controls.crouch) || pads.crouch,
      cleanHeld: this.anyDown(Controls.clean) || mouseLeft || pads.clean,
      winchHeld: this.anyDown(Controls.winch) || pads.winch,
      safetyPressed: safetyKeyEdge || mouseRightEdge || padSafety,
      pausePressed: pauseEdge,
      mutePressed: muteEdge,
      anyTapped: cleanEdge || crouchEdge || safetyKeyEdge || mouseLeftEdge || mouseRightEdge || padAny,
    };
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);

    if (this.keyboard) {
      for (const key of this.keys.values()) this.keyboard.removeKey(key, true);
    }
    this.keys.clear();
    this.touch.destroy();
  }

  /* ----------------------------------------------------------- internals */

  private revealTouchControls(): void {
    if (this.touchSeen) return;
    this.touchSeen = true;
    this.touch.setVisible(true);
  }

  private anyDown(names: readonly string[]): boolean {
    for (const name of names) {
      const key = this.keys.get(name);
      if (key && key.isDown) return true;
    }
    return false;
  }

  /** Timestamp of the most recent press among held keys, or 0 if none is held. */
  private heldSince(names: readonly string[]): number {
    let since = 0;
    for (const name of names) {
      const key = this.keys.get(name);
      if (key && key.isDown && key.timeDown > since) since = key.timeDown;
    }
    return since;
  }

  private justDown(names: readonly string[]): boolean {
    let edge = false;
    for (const name of names) {
      const key = this.keys.get(name);
      // No short-circuit: every key must be polled or its flag survives to
      // fire on some later, unrelated frame.
      if (key && Phaser.Input.Keyboard.JustDown(key)) edge = true;
    }
    return edge;
  }
}
