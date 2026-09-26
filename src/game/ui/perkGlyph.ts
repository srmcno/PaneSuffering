import Phaser from 'phaser';
import type { PerkGlyph } from '../systems/Perks';

/**
 * Draw an upgrade's pictogram into a Graphics, centred on (cx, cy) and fitting
 * a square of side `s`. Shared by the draft cards and the HUD strip so the two
 * always agree on what an upgrade looks like.
 */
export function drawPerkGlyph(
  g: Phaser.GameObjects.Graphics,
  glyph: PerkGlyph,
  cx: number,
  cy: number,
  s: number,
  color: number,
): void {
  const u = s / 20;
  const line = Math.max(1.5, 2 * u);
  g.lineStyle(line, color, 1);
  g.fillStyle(color, 1);

  switch (glyph) {
    case 'bucket': {
      g.beginPath();
      g.moveTo(cx - 7 * u, cy - 4 * u);
      g.lineTo(cx + 7 * u, cy - 4 * u);
      g.lineTo(cx + 5 * u, cy + 8 * u);
      g.lineTo(cx - 5 * u, cy + 8 * u);
      g.closePath();
      g.strokePath();
      g.fillRect(cx - 5.5 * u, cy + 1 * u, 11 * u, 6 * u);
      g.beginPath();
      g.arc(cx, cy - 4 * u, 7 * u, Math.PI, 0);
      g.strokePath();
      break;
    }
    case 'hose': {
      g.beginPath();
      g.arc(cx - 2 * u, cy, 6 * u, Math.PI * 0.5, Math.PI * 2.1);
      g.strokePath();
      g.fillRect(cx + 3 * u, cy - 2 * u, 6 * u, 4 * u);
      for (let i = 0; i < 3; i++) g.fillCircle(cx + 11 * u, cy - 3 * u + i * 3 * u, 1 * u);
      break;
    }
    case 'blade': {
      g.fillRect(cx - 8 * u, cy - 7 * u, 16 * u, 4 * u);
      g.lineBetween(cx, cy - 3 * u, cx, cy + 9 * u);
      for (let i = 0; i < 3; i++) g.fillCircle(cx - 5 * u + i * 5 * u, cy + 1 * u, 1.2 * u);
      break;
    }
    case 'wide': {
      g.fillRect(cx - 9 * u, cy - 6 * u, 18 * u, 3.5 * u);
      g.lineBetween(cx, cy - 2.5 * u, cx, cy + 8 * u);
      g.lineBetween(cx - 9 * u, cy + 3 * u, cx - 5 * u, cy + 3 * u);
      g.lineBetween(cx + 5 * u, cy + 3 * u, cx + 9 * u, cy + 3 * u);
      g.fillTriangle(cx - 10 * u, cy + 3 * u, cx - 7 * u, cy + 1 * u, cx - 7 * u, cy + 5 * u);
      g.fillTriangle(cx + 10 * u, cy + 3 * u, cx + 7 * u, cy + 1 * u, cx + 7 * u, cy + 5 * u);
      break;
    }
    case 'weight': {
      g.fillRect(cx - 7 * u, cy - 2 * u, 14 * u, 10 * u);
      g.lineBetween(cx, cy - 2 * u, cx, cy - 8 * u);
      g.strokeCircle(cx, cy - 8 * u, 2 * u);
      break;
    }
    case 'clip': {
      g.strokeRoundedRect(cx - 5 * u, cy - 8 * u, 10 * u, 16 * u, 4 * u);
      g.lineBetween(cx + 5 * u, cy - 3 * u, cx + 1 * u, cy + 1 * u);
      break;
    }
    case 'helmet': {
      g.beginPath();
      g.arc(cx, cy + 3 * u, 8 * u, Math.PI, 0);
      g.closePath();
      g.fillPath();
      g.fillRect(cx - 10 * u, cy + 3 * u, 20 * u, 2.5 * u);
      break;
    }
    case 'cross': {
      g.fillRect(cx - 2.5 * u, cy - 8 * u, 5 * u, 16 * u);
      g.fillRect(cx - 8 * u, cy - 2.5 * u, 16 * u, 5 * u);
      break;
    }
    case 'fist': {
      g.fillRoundedRect(cx - 7 * u, cy - 5 * u, 14 * u, 9 * u, 2 * u);
      g.fillRect(cx - 5 * u, cy + 4 * u, 10 * u, 5 * u);
      g.lineStyle(line * 0.6, 0x080b12, 0.8);
      for (let i = 1; i < 4; i++) g.lineBetween(cx - 7 * u + i * 3.5 * u, cy - 5 * u, cx - 7 * u + i * 3.5 * u, cy);
      break;
    }
    case 'spikes': {
      g.fillRect(cx - 9 * u, cy + 5 * u, 18 * u, 3 * u);
      for (let i = 0; i < 5; i++) {
        const x = cx - 8 * u + i * 4 * u;
        g.fillTriangle(x - 1.5 * u, cy + 5 * u, x + 1.5 * u, cy + 5 * u, x, cy - 7 * u);
      }
      break;
    }
    case 'coin': {
      g.strokeCircle(cx, cy, 8 * u);
      g.fillRect(cx - 1 * u, cy - 6 * u, 2 * u, 12 * u);
      g.lineBetween(cx + 3.5 * u, cy - 3 * u, cx - 3 * u, cy - 3 * u);
      g.lineBetween(cx - 3 * u, cy - 3 * u, cx + 3 * u, cy + 3 * u);
      g.lineBetween(cx + 3 * u, cy + 3 * u, cx - 3.5 * u, cy + 3 * u);
      break;
    }
  }
}
