import Phaser from 'phaser';
import {
  DEPTH,
  FLOOR_COUNT,
  FONT,
  PANE,
  RIG,
  ROOF_Y,
  STREET_Y,
  TOWER,
  floorY,
  paneX,
} from '../config';
import { Rng } from '../core/Rng';
import { WindowPane } from './WindowPane';

/** Anything the band culler can switch off. */
type Cullable = Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };

/**
 * The tower face: concrete, mullions, roof rigging, and the panes themselves.
 * All of it is static geometry drawn once, so the per-frame cost is just the
 * panes' grime textures.
 */
export class Tower {
  readonly panes: WindowPane[] = [];
  private readonly byFloor: WindowPane[][] = [];
  /** Static geometry tagged with its world span, so it can be culled. */
  private readonly bands: Array<{ top: number; bottom: number; objects: Cullable[] }> = [];

  constructor(private readonly scene: Phaser.Scene) {
    const rng = new Rng(0x7042e2);
    this.drawShell();
    this.drawFloors(rng);
    this.drawRoof();
    this.drawBase();
  }

  /**
   * Phaser does not cull Graphics, so a tower-height command list would be
   * re-tessellated every frame. Banding the static geometry by floor and
   * toggling visibility keeps the per-frame cost proportional to what is
   * actually on screen.
   */
  update(scrollY: number, viewHeight: number): void {
    const top = scrollY - 260;
    const bottom = scrollY + viewHeight + 260;
    for (const band of this.bands) {
      const visible = band.bottom >= top && band.top <= bottom;
      for (const obj of band.objects) obj.setVisible(visible);
    }
  }

  private band(top: number, bottom: number, ...objects: Cullable[]): void {
    this.bands.push({ top, bottom, objects });
  }

  panesOnFloor(floor: number): WindowPane[] {
    return this.byFloor[floor] ?? [];
  }

  /** Mean cleanliness of a floor, 0..1. */
  floorProgress(floor: number): number {
    const panes = this.panesOnFloor(floor);
    if (panes.length === 0) return 1;
    let total = 0;
    for (const p of panes) total += p.progress;
    return total / panes.length;
  }

  destroy(): void {
    for (const pane of this.panes) pane.destroy();
  }

  /* ------------------------------------------------------------- drawing */

  private drawShell(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.facade);
    const top = ROOF_Y - 60;
    const bottom = STREET_Y + 40;
    const h = bottom - top;

    g.fillStyle(0x2f3545, 1);
    g.fillRect(TOWER.left, top, TOWER.width, h);

    // Sunlit left edge, shadowed right edge.
    g.fillStyle(0x4d566d, 1);
    g.fillRect(TOWER.left, top, 26, h);
    g.fillStyle(0x5f6a84, 0.55);
    g.fillRect(TOWER.left, top, 8, h);
    g.fillStyle(0x1a1f2b, 1);
    g.fillRect(TOWER.right - 34, top, 34, h);
    g.fillStyle(0x11151f, 0.65);
    g.fillRect(TOWER.right - 12, top, 12, h);

    // Recessed window bay so the glass reads as inset.
    g.fillStyle(0x272d3b, 1);
    g.fillRect(TOWER.left + 30, top, TOWER.width - 70, h);

    const noise = this.scene.add
      .tileSprite(TOWER.left, top, TOWER.width, h, 'concreteNoise')
      .setOrigin(0, 0)
      .setDepth(DEPTH.facade + 1)
      .setAlpha(0.85);
    noise.setTileScale(1.4, 1.4);

    // Soft contact shadow where the tower meets the sky.
    this.scene.add
      .image(TOWER.left, top + h / 2, 'glow')
      .setDisplaySize(120, h)
      .setOrigin(1, 0.5)
      .setTint(0x000000)
      .setAlpha(0.35)
      .setDepth(DEPTH.facade + 2);
    this.scene.add
      .image(TOWER.right, top + h / 2, 'glow')
      .setDisplaySize(150, h)
      .setOrigin(0, 0.5)
      .setTint(0x000000)
      .setAlpha(0.4)
      .setDepth(DEPTH.facade + 2);
  }

  private drawFloors(rng: Rng): void {
    const half = PANE.height / 2;

    for (let floor = 0; floor < FLOOR_COUNT; floor++) {
      const trim = this.scene.add.graphics().setDepth(DEPTH.facadeTrim);
      // The reveal has to sit *behind* the glass; the trim layer is in front.
      const reveal = this.scene.add.graphics().setDepth(DEPTH.paneGlass - 1);
      const y = floorY(floor);
      const row: WindowPane[] = [];

      for (let col = 0; col < PANE.perFloor; col++) {
        const x = paneX(col);
        // Reveal / inner shadow around the glass.
        reveal.fillStyle(0x171c27, 1);
        reveal.fillRect(x - PANE.width / 2 - 7, y - half - 7, PANE.width + 14, PANE.height + 14);
        const pane = new WindowPane(this.scene, floor, col, x, y, rng);
        row.push(pane);
        this.panes.push(pane);
      }
      this.byFloor[floor] = row;

      // Mullions between and beside the panes.
      trim.fillStyle(0x596174, 1);
      for (let col = 0; col <= PANE.perFloor; col++) {
        const x = paneX(0) - PANE.width / 2 - PANE.gap / 2 + col * (PANE.width + PANE.gap);
        trim.fillRect(x - 5, y - half - 12, 10, PANE.height + 24);
        trim.fillStyle(0x7c869d, 1);
        trim.fillRect(x - 5, y - half - 12, 3, PANE.height + 24);
        trim.fillStyle(0x596174, 1);
      }

      // Head and sill transoms.
      trim.fillStyle(0x6a7387, 1);
      trim.fillRect(paneX(0) - PANE.width / 2 - 14, y - half - 14, this.bandWidth(), 8);
      trim.fillStyle(0x3f4658, 1);
      trim.fillRect(paneX(0) - PANE.width / 2 - 14, y + half + 6, this.bandWidth(), 10);

      this.drawSpandrel(floor, rng);
      this.band(y - half - 40, y + half + 40, trim, reveal);
    }
  }

  private bandWidth(): number {
    return PANE.perFloor * PANE.width + (PANE.perFloor - 1) * PANE.gap + 28;
  }

  /** The concrete band under each floor, with signage and services. */
  private drawSpandrel(floor: number, rng: Rng): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.facadeTrim);
    const y = floorY(floor) + PANE.height / 2 + 16;
    const label = this.scene.add.text(0, 0, '');
    const bandW = this.bandWidth();
    const x0 = paneX(0) - PANE.width / 2 - 14;

    g.fillStyle(0x353c4d, 1);
    g.fillRect(x0, y, bandW, 148);
    g.fillStyle(0x454e63, 1);
    g.fillRect(x0, y, bandW, 5);
    g.fillStyle(0x1c212d, 1);
    g.fillRect(x0, y + 143, bandW, 5);

    // Grille vents.
    g.fillStyle(0x232936, 1);
    for (let i = 0; i < 3; i++) {
      const vx = x0 + 40 + i * (bandW / 3);
      g.fillRect(vx, y + 34, 96, 46);
      g.fillStyle(0x161b25, 1);
      for (let s = 0; s < 6; s++) g.fillRect(vx + 4, y + 38 + s * 7, 88, 3);
      g.fillStyle(0x232936, 1);
    }

    // Stencilled floor number.
    label
      .setText(`${(floor + 41).toString().padStart(2, '0')}`)
      .setPosition(x0 + bandW - 26, y + 74)
      .setStyle({ fontFamily: FONT, fontSize: '58px', color: '#454e63', fontStyle: '900' })
      .setOrigin(1, 0.5)
      .setDepth(DEPTH.facadeTrim + 1)
      .setAlpha(0.85);

    // Anchor eyelets the pigeons like to sit on.
    for (let i = 0; i < 2; i++) {
      const ex = x0 + rng.between(bandW * 0.15, bandW * 0.85);
      g.fillStyle(0x8792a6, 1);
      g.fillRect(ex, y + 96, 34, 7);
      g.fillStyle(0x596070, 1);
      g.fillRect(ex, y + 103, 34, 3);
    }

    this.band(y - 30, y + 180, g, label);
  }

  private drawRoof(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.facadeTrim);
    const parapetY = ROOF_Y;
    const roofObjects: Cullable[] = [g];

    // Parapet cap.
    g.fillStyle(0x3d465c, 1);
    g.fillRect(TOWER.left - 16, parapetY, TOWER.width + 32, 46);
    g.fillStyle(0x5a6580, 1);
    g.fillRect(TOWER.left - 16, parapetY, TOWER.width + 32, 8);
    g.fillStyle(0x1a1f2b, 1);
    g.fillRect(TOWER.left - 16, parapetY + 42, TOWER.width + 32, 6);

    // Davit arms the cables run over.
    for (const side of [-1, 1]) {
      const x = TOWER.centerX + side * RIG.cableOffset;
      g.fillStyle(0x8792a6, 1);
      g.fillRect(x - 7, parapetY - 62, 14, 66);
      g.fillRect(x - 7 - side * 34, parapetY - 68, 48, 12);
      g.fillStyle(0x515a6b, 1);
      g.fillRect(x - 7, parapetY - 62, 4, 66);
      roofObjects.push(
        this.scene.add
          .circle(x, parapetY - 62, 9, 0x2b3140)
          .setStrokeStyle(3, 0xa8b3c6)
          .setDepth(DEPTH.facadeTrim + 1),
      );
    }

    // Rooftop plant: tank, ducts, mast.
    g.fillStyle(0x2b3140, 1);
    g.fillRect(TOWER.centerX - 120, parapetY - 118, 150, 116);
    g.fillStyle(0x394154, 1);
    g.fillRect(TOWER.centerX - 120, parapetY - 118, 150, 10);
    g.fillStyle(0x232936, 1);
    g.fillRect(TOWER.centerX + 60, parapetY - 70, 80, 68);
    g.fillStyle(0x8792a6, 1);
    g.fillRect(TOWER.centerX + 176, parapetY - 210, 5, 208);

    const beacon = this.scene.add
      .circle(TOWER.centerX + 178, parapetY - 214, 5, 0xff5a4d)
      .setDepth(DEPTH.facadeTrim + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: beacon,
      alpha: { from: 1, to: 0.12 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    roofObjects.push(
      beacon,
      this.scene.add
        .text(TOWER.centerX, parapetY - 150, 'VANDERMEER TOWER', {
          fontFamily: FONT,
          fontSize: '26px',
          color: '#6d7691',
          fontStyle: '800',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.facadeTrim + 1),
    );
    this.band(parapetY - 260, parapetY + 60, ...roofObjects);
  }

  /** Below the lowest floor the facade just keeps going, into haze. */
  private drawBase(): void {
    const top = floorY(0) + PANE.height / 2 + 170;
    const rng = new Rng(0xba5e);

    for (let y = top; y < STREET_Y - 200; y += 118) {
      const strip = this.scene.add.graphics().setDepth(DEPTH.facadeTrim);
      this.band(y, y + 118, strip);
      const g = strip;
      g.fillStyle(0x272d3b, 1);
      g.fillRect(TOWER.left + 30, y, TOWER.width - 70, 74);
      g.fillStyle(0x161b26, 1);
      g.fillRect(TOWER.left + 46, y + 12, TOWER.width - 102, 48);
      // A few lit offices far below.
      if (rng.chance(0.6)) {
        const lx = rng.between(TOWER.left + 60, TOWER.right - 120);
        g.fillStyle(0x6b6242, rng.between(0.3, 0.7));
        g.fillRect(lx, y + 14, rng.between(30, 90), 44);
      }
      g.fillStyle(0x353c4d, 1);
      g.fillRect(TOWER.left + 30, y + 74, TOWER.width - 70, 44);
    }

    // Haze so the drop reads as depth rather than a wall.
    this.scene.add
      .image(TOWER.centerX, STREET_Y - 340, 'glow')
      .setDisplaySize(TOWER.width + 320, 900)
      .setTint(0x1a2338)
      .setAlpha(0.85)
      .setDepth(DEPTH.facadeTrim + 2);
  }
}
