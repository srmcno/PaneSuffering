import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PHYSICS } from './game/config';
import { BootScene } from './game/scenes/BootScene';
import { GameOverScene } from './game/scenes/GameOverScene';
import { GameScene } from './game/scenes/GameScene';
import { TitleScene } from './game/scenes/TitleScene';
import { UIScene } from './game/scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#101425',
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: PHYSICS.gravityY },
      enableSleep: false,
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [BootScene, TitleScene, GameScene, UIScene, GameOverScene],
});

window.addEventListener('resize', () => {
  game.scale.refresh();
});
