import Phaser from 'phaser';
import { DEPTH, PANE } from '../config';
import { Rng } from '../core/Rng';

const COLS = 14;
const ROWS = 10;
const CELL_COUNT = COLS * ROWS;

/** Scrub cost of a cell: ordinary city grime versus a baked-on dropping. */
const GRIME_TOUGHNESS = 1;
const SPLAT_TOUGHNESS = 3.1;

/**
 * A single pane of glass. Grime lives in a RenderTexture that is genuinely
 * erased where the squeegee passes, and a matching cell grid drives the
 * numeric progress so the readout can never disagree with what you can see.
 */
export class WindowPane {
  readonly floor: number;
  readonly col: number;
  readonly cx: number;
  readonly cy: number;
  readonly bounds: Phaser.Geom.Rectangle;

  /** 0..1 fraction of cells scrubbed clean. */
  progress = 0;
  /** True once every cell is clean, which pays the spotless bonus. */
  spotless = false;
  /** Lifetime latches: each bonus is paid at most once per pane, ever. */
  bonusPaid = false;
  spotlessPaid = false;

  private readonly interior: Phaser.GameObjects.Image;
  private readonly grime: Phaser.GameObjects.RenderTexture;
  private readonly sheen: Phaser.GameObjects.Image;
  private readonly rim: Phaser.GameObjects.Rectangle;
  private readonly toughness = new Float32Array(CELL_COUNT);
  private cleanCells = 0;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly grimeKey: string;

  constructor(scene: Phaser.Scene, floor: number, col: number, x: number, y: number, rng: Rng) {
    this.floor = floor;
    this.col = col;
    this.cx = x;
    this.cy = y;
    this.bounds = new Phaser.Geom.Rectangle(x - PANE.width / 2, y - PANE.height / 2, PANE.width, PANE.height);
    this.cellW = PANE.width / COLS;
    this.cellH = PANE.height / ROWS;
    this.grimeKey = `grime${rng.int(0, 2)}`;

    this.interior = scene.add
      .image(x, y, `interior${rng.int(0, 5)}`)
      .setDisplaySize(PANE.width, PANE.height)
      .setDepth(DEPTH.paneGlass);

    this.grime = scene.add
      .renderTexture(x - PANE.width / 2, y - PANE.height / 2, PANE.width, PANE.height)
      .setOrigin(0, 0)
      .setDepth(DEPTH.paneGrime);
    this.grime.draw(this.grimeKey, -rng.between(0, 60), -rng.between(0, 90));

    this.toughness.fill(GRIME_TOUGHNESS);
    this.seedSplats(rng);

    this.sheen = scene.add
      .image(x, y, 'paneSheen')
      .setDisplaySize(PANE.width, PANE.height)
      .setDepth(DEPTH.paneGrime + 1)
      .setAlpha(0.1)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.rim = scene.add
      .rectangle(x, y, PANE.width, PANE.height)
      .setStrokeStyle(2, 0x8fd6ff, 0)
      .setDepth(DEPTH.paneGrime + 2);
  }

  /**
   * Wipe at a world position. Returns the progress gained this call, so the
   * caller can convert scrubbing directly into score.
   */
  scrub(worldX: number, worldY: number, radius: number, power: number): number {
    if (this.progress >= 1) return 0;

    const lx = worldX - this.bounds.x;
    const ly = worldY - this.bounds.y;
    if (lx < -radius || ly < -radius || lx > PANE.width + radius || ly > PANE.height + radius) return 0;

    const before = this.cleanCells;
    const c0 = Math.max(0, Math.floor((lx - radius) / this.cellW));
    const c1 = Math.min(COLS - 1, Math.floor((lx + radius) / this.cellW));
    const r0 = Math.max(0, Math.floor((ly - radius) / this.cellH));
    const r1 = Math.min(ROWS - 1, Math.floor((ly + radius) / this.cellH));
    const rSq = radius * radius;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        if (this.toughness[i] <= 0) continue;
        const dx = (c + 0.5) * this.cellW - lx;
        const dy = (r + 0.5) * this.cellH - ly;
        const dSq = dx * dx + dy * dy;
        if (dSq > rSq) continue;
        // Full strength at the squeegee blade, tapering to the edge of reach.
        const falloff = 1 - 0.55 * (dSq / rSq);
        this.toughness[i] -= power * falloff;
        if (this.toughness[i] <= 0) {
          this.toughness[i] = 0;
          this.cleanCells++;
          this.eraseCell(c, r);
        }
      }
    }

    if (this.cleanCells === before) return 0;

    const prev = this.progress;
    this.progress = this.cleanCells / CELL_COUNT;
    this.sheen.setAlpha(0.1 + this.progress * 0.34);
    if (this.progress >= 1 && !this.spotless) this.markSpotless();
    return this.progress - prev;
  }

  /** A pigeon undoes your work. Re-dirties a patch and reopens the pane. */
  soil(worldX: number, worldY: number): void {
    const lx = Phaser.Math.Clamp(worldX - this.bounds.x, 24, PANE.width - 24);
    const ly = Phaser.Math.Clamp(worldY - this.bounds.y, 24, PANE.height - 24);
    this.grime.draw('splat', lx - 48, ly - 48);

    const radius = 34;
    const rSq = radius * radius;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const dx = (c + 0.5) * this.cellW - lx;
        const dy = (r + 0.5) * this.cellH - ly;
        if (dx * dx + dy * dy > rSq) continue;
        const i = r * COLS + c;
        if (this.toughness[i] <= 0) this.cleanCells--;
        this.toughness[i] = SPLAT_TOUGHNESS;
      }
    }
    this.cleanCells = Math.max(0, this.cleanCells);
    this.progress = this.cleanCells / CELL_COUNT;
    // Cleanliness reopens, but bonusPaid/spotlessPaid deliberately do not:
    // they are lifetime award latches, and re-paying them would let repeated
    // pigeon visits farm score, panes-cleaned and multiplier streak.
    this.spotless = false;
    this.sheen.setAlpha(0.1 + this.progress * 0.34);
    this.rim.setStrokeStyle(2, 0x8fd6ff, 0);
  }

  destroy(): void {
    this.interior.destroy();
    this.grime.destroy();
    this.sheen.destroy();
    this.rim.destroy();
  }

  private seedSplats(rng: Rng): void {
    const count = rng.int(0, 2);
    for (let i = 0; i < count; i++) {
      const lx = rng.between(30, PANE.width - 30);
      const ly = rng.between(30, PANE.height - 30);
      this.grime.draw('splat', lx - 48, ly - 48, 0.9);
      const radius = 30;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const dx = (c + 0.5) * this.cellW - lx;
          const dy = (r + 0.5) * this.cellH - ly;
          if (dx * dx + dy * dy <= radius * radius) this.toughness[r * COLS + c] = SPLAT_TOUGHNESS;
        }
      }
    }
  }

  private eraseCell(c: number, r: number): void {
    // 'cellBrush' is 40px, comfortably wider than a cell, so adjacent wipes
    // overlap into one continuous streak instead of a visible grid.
    this.grime.erase('cellBrush', (c + 0.5) * this.cellW - 20, (r + 0.5) * this.cellH - 20);
  }

  private markSpotless(): void {
    this.spotless = true;
    this.grime.clear();
    this.rim.setStrokeStyle(2, 0x8fd6ff, 0.55);
    this.sheen.setAlpha(0.44);
  }
}
