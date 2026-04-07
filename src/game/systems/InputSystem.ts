import Phaser from 'phaser';
import { Controls } from '../config';
import { InputIntent } from '../types/GameTypes';

export class InputSystem {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private readonly pointer: Phaser.Input.Pointer;

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is required for desktop prototype.');
    }
    const keyMap = [
      ...Controls.moveLeft,
      ...Controls.moveRight,
      ...Controls.leanLeft,
      ...Controls.leanRight,
      ...Controls.clean,
      ...Controls.duck,
      ...Controls.anchor,
      ...Controls.pause,
    ];
    keyMap.forEach((key) => {
      this.keys[key] = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[key as keyof typeof Phaser.Input.Keyboard.KeyCodes]);
    });
    this.pointer = scene.input.activePointer;
  }

  public getIntent(): InputIntent {
    const moveLeft = Controls.moveLeft.some((k) => this.keys[k].isDown);
    const moveRight = Controls.moveRight.some((k) => this.keys[k].isDown);
    const leanLeft = Controls.leanLeft.some((k) => this.keys[k].isDown);
    const leanRight = Controls.leanRight.some((k) => this.keys[k].isDown);

    return {
      move: moveLeft ? -1 : moveRight ? 1 : 0,
      lean: leanLeft ? -1 : leanRight ? 1 : 0,
      cleanHeld: Controls.clean.some((k) => this.keys[k].isDown) || this.pointer.leftButtonDown(),
      duckHeld: Controls.duck.some((k) => this.keys[k].isDown),
      anchorPressed: Phaser.Input.Keyboard.JustDown(this.keys.SHIFT) || this.pointer.rightButtonDown(),
      pausePressed: Phaser.Input.Keyboard.JustDown(this.keys.ESC),
    };
  }
}
