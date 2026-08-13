import Phaser from 'phaser';
import { GAME_CONFIG } from './game/config';
import { audio } from './game/audio/AudioEngine';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { GameScene } from './game/scenes/GameScene';
import { UIScene } from './game/scenes/UIScene';
import { PauseScene } from './game/scenes/PauseScene';
import { GameOverScene } from './game/scenes/GameOverScene';

const game = new Phaser.Game({
  ...GAME_CONFIG,
  parent: 'app',
  scene: [BootScene, TitleScene, GameScene, UIScene, PauseScene, GameOverScene],
});

// Handle for dev tooling and automated smoke tests. Available in dev, and in
// any build via ?debug — a read-only handle, not a cheat surface.
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __PHASER_GAME__?: Phaser.Game }).__PHASER_GAME__ = game;
}

// WebAudio needs a real gesture; the scenes call unlock() too, but catching it
// at the document level means the very first click anywhere counts.
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// The single audio tick for the whole app: ambience and adaptive music keep
// running in every scene, and scenes push their parameters via setParams
// rather than calling update() themselves, so smoothing advances once a frame.
game.events.on(Phaser.Core.Events.POST_STEP, (_time: number, delta: number) => {
  audio.update(Math.min(delta / 1000, 0.1));
});

// Scale.FIT handles resizing, but a fresh refresh avoids a stale letterbox
// after an orientation change on mobile.
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
});
