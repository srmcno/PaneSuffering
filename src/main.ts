import Phaser from 'phaser';
import { GAME_CONFIG } from './game/config';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { GameScene } from './game/scenes/GameScene';
import { UIScene } from './game/scenes/UIScene';
import { GameOverScene } from './game/scenes/GameOverScene';

const game = new Phaser.Game({
  ...GAME_CONFIG,
  scene: [BootScene, TitleScene, GameScene, UIScene, GameOverScene],
  parent: 'app',
});

window.addEventListener('resize', () => {
  const { innerWidth, innerHeight } = window;
  game.scale.resize(innerWidth, innerHeight);
});
