import Phaser from 'phaser';

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 2200;
export const WINDOW_COLUMNS = 4;
export const WINDOW_ROWS = 8;

export const Controls = {
  moveLeft: ['A', 'LEFT'],
  moveRight: ['D', 'RIGHT'],
  leanLeft: ['Q'],
  leanRight: ['E'],
  clean: ['SPACE'],
  duck: ['S', 'CTRL'],
  anchor: ['SHIFT'],
  pause: ['ESC'],
};

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0f172a',
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 0.85 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};
