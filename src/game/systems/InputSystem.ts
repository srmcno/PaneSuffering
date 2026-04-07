import Phaser from 'phaser';
import { PlayerIntent } from '../types/GameTypes';

export class InputSystem {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private pointerClean = false;
  private pointerAnchor = false;

  constructor(private scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys({
      A: Phaser.Input.Keyboard.KeyCodes.A,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      LEFT: Phaser.Input.Keyboard.KeyCodes.LEFT,
      RIGHT: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Q: Phaser.Input.Keyboard.KeyCodes.Q,
      E: Phaser.Input.Keyboard.KeyCodes.E,
      SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      CTRL: Phaser.Input.Keyboard.KeyCodes.CTRL,
      SHIFT: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      ESC: Phaser.Input.Keyboard.KeyCodes.ESC,
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerClean = pointer.leftButtonDown();
      this.pointerAnchor = pointer.rightButtonDown();
    });
    scene.input.on('pointerup', () => {
      this.pointerClean = false;
      this.pointerAnchor = false;
    });
  }

  readIntent(): PlayerIntent {
    const moveLeft = this.keys.A.isDown || this.keys.LEFT.isDown;
    const moveRight = this.keys.D.isDown || this.keys.RIGHT.isDown;
    const leanLeft = this.keys.Q.isDown;
    const leanRight = this.keys.E.isDown;

    return {
      move: moveLeft === moveRight ? 0 : moveLeft ? -1 : 1,
      lean: leanLeft === leanRight ? 0 : leanLeft ? -1 : 1,
      cleanHeld: this.keys.SPACE.isDown || this.pointerClean,
      duckHeld: this.keys.S.isDown || this.keys.CTRL.isDown,
      anchorPressed: Phaser.Input.Keyboard.JustDown(this.keys.SHIFT) || this.pointerAnchor,
      pausePressed: Phaser.Input.Keyboard.JustDown(this.keys.ESC),
    };
  }
}
