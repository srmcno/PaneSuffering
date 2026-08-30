import Phaser from 'phaser';

/**
 * Bind a menu key so the OS key-repeat stream cannot act for the player.
 * SPACE is the clean key and is routinely still held when a run ends, so a
 * results screen bound to raw keydown would restart the run ~33ms after it
 * appeared. Phaser's own repeat suppression only covers `Key` objects a scene
 * has registered, and the menus register none.
 */
export function onKeyPress(
  kb: Phaser.Input.Keyboard.KeyboardPlugin,
  keys: string | string[],
  fn: () => void,
): void {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    kb.on(`keydown-${key}`, (event: KeyboardEvent) => {
      if (!event.repeat) fn();
    });
  }
}
