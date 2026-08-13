import Phaser from 'phaser';
import { DEPTH, STREET_Y, VIEW, floorY } from '../config';
import { Rng } from '../core/Rng';

interface CloudRef {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/**
 * Sky, parallax skyline and the street far below. The sky cross-fades from
 * golden hour at street level to deep dusk at the penthouse, so altitude is
 * legible from the colour of the frame alone.
 */
export class Backdrop {
  private skyLow: Phaser.GameObjects.Image;
  private skyHigh: Phaser.GameObjects.Image;
  private sun: Phaser.GameObjects.Image;
  private sunDisc: Phaser.GameObjects.Arc;
  private stars: Phaser.GameObjects.Container;
  private clouds: CloudRef[] = [];
  private beacons: Phaser.GameObjects.Arc[] = [];
  private haze: Phaser.GameObjects.Image;
  private altitude = 0;
  private beaconPhase = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.buildGradient('skyLow', [
      [0, '#1d2b52'],
      [0.34, '#4a4a86'],
      [0.58, '#a55f7a'],
      [0.78, '#e08a5a'],
      [0.92, '#f5b96a'],
      [1, '#ffd79a'],
    ]);
    this.buildGradient('skyHigh', [
      [0, '#05060f'],
      [0.3, '#0d1330'],
      [0.58, '#22224d'],
      [0.8, '#4a2c58'],
      [1, '#7a3f56'],
    ]);

    this.skyLow = scene.add
      .image(VIEW.W / 2, VIEW.H / 2, 'skyLow')
      .setDisplaySize(VIEW.W, VIEW.H)
      .setScrollFactor(0)
      .setDepth(DEPTH.sky);
    this.skyHigh = scene.add
      .image(VIEW.W / 2, VIEW.H / 2, 'skyHigh')
      .setDisplaySize(VIEW.W, VIEW.H)
      .setScrollFactor(0)
      .setDepth(DEPTH.sky + 1)
      .setAlpha(0);

    this.sun = scene.add
      .image(300, 300, 'glow')
      .setDisplaySize(760, 760)
      .setScrollFactor(0, 0.055)
      .setDepth(DEPTH.sky + 2)
      .setTint(0xffb469)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sunDisc = scene.add
      .circle(300, 300, 46, 0xffd9a0, 0.9)
      .setScrollFactor(0, 0.055)
      .setDepth(DEPTH.sky + 3)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.stars = this.buildStars();
    this.buildSkyline();
    this.buildClouds();

    this.haze = scene.add
      .image(VIEW.W / 2, 0, 'glow')
      .setDisplaySize(VIEW.W * 1.6, 460)
      .setScrollFactor(0, 0.055)
      .setDepth(DEPTH.skylineNear + 1)
      .setTint(0xffa06a)
      .setAlpha(0.22)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.positionHorizonPieces();
    this.buildStreet();
  }

  /** `altitude` is 0 at the lowest floor and 1 at the penthouse. */
  update(dt: number, altitude: number): void {
    this.altitude = Phaser.Math.Linear(this.altitude, altitude, Math.min(1, dt * 3));
    const t = Phaser.Math.Easing.Sine.InOut(Phaser.Math.Clamp(this.altitude, 0, 1));

    const highAlpha = t * 0.94;
    this.skyHigh.setAlpha(highAlpha).setVisible(highAlpha > 0.01);
    this.skyLow.setVisible(highAlpha < 0.985);
    const starAlpha = Phaser.Math.Clamp((t - 0.18) * 1.5, 0, 1);
    this.stars.setAlpha(starAlpha).setVisible(starAlpha > 0.01);
    this.sun.setAlpha(0.5 - t * 0.28);
    this.sunDisc.setAlpha(0.9 - t * 0.55);
    this.haze.setAlpha(0.22 - t * 0.13);

    for (const cloud of this.clouds) {
      cloud.img.x += cloud.speed * dt;
      const halfW = cloud.img.displayWidth / 2;
      if (cloud.speed > 0 && cloud.img.x - halfW > VIEW.W + 120) cloud.img.x = -halfW - 120;
      if (cloud.speed < 0 && cloud.img.x + halfW < -120) cloud.img.x = VIEW.W + halfW + 120;
    }

    this.beaconPhase += dt;
    const on = this.beaconPhase % 2.4 < 0.22;
    for (const b of this.beacons) b.setAlpha(on ? 0.95 : 0.12);
  }

  private buildGradient(key: string, stops: Array<[number, string]>): void {
    if (this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.createCanvas(key, 8, 512);
    if (!tex) return;
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [pos, color] of stops) grad.addColorStop(pos, color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 512);
    tex.refresh();
  }

  private buildStars(): Phaser.GameObjects.Container {
    const rng = new Rng(0x57a25);
    const container = this.scene.add
      .container(0, 0)
      .setScrollFactor(0, 0.03)
      .setDepth(DEPTH.stars)
      .setAlpha(0);

    for (let i = 0; i < 130; i++) {
      const star = this.scene.add
        .image(rng.between(0, VIEW.W), rng.between(-220, VIEW.H * 0.62), 'star')
        .setScale(rng.between(0.4, 1.25))
        .setAlpha(rng.between(0.35, 1))
        .setBlendMode(Phaser.BlendModes.ADD);
      container.add(star);
      if (rng.chance(0.28)) {
        this.scene.tweens.add({
          targets: star,
          alpha: { from: star.alpha, to: star.alpha * 0.25 },
          duration: rng.between(900, 2600),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
    }
    return container;
  }

  /** Three skyline bands baked into canvas textures, then parallaxed. */
  private buildSkyline(): void {
    const layers = [
      { key: 'skylineFar', tone: '#2b3555', win: '#7f8fc4', h: 300, minW: 34, maxW: 86, depth: DEPTH.skylineFar, factor: 0.06, alpha: 0.62, seed: 11 },
      { key: 'skylineMid', tone: '#1c2340', win: '#93a2d6', h: 380, minW: 46, maxW: 118, depth: DEPTH.skylineMid, factor: 0.11, alpha: 0.85, seed: 27 },
      { key: 'skylineNear', tone: '#0f1526', win: '#c8b183', h: 470, minW: 66, maxW: 168, depth: DEPTH.skylineNear, factor: 0.19, alpha: 1, seed: 43 },
    ];

    for (const layer of layers) {
      this.bakeSkyline(layer.key, layer.tone, layer.win, layer.h, layer.minW, layer.maxW, layer.seed);
      const img = this.scene.add
        .image(VIEW.W / 2, 0, layer.key)
        .setOrigin(0.5, 0)
        .setScrollFactor(0, layer.factor)
        .setDepth(layer.depth)
        .setAlpha(layer.alpha)
        .setName(layer.key);
      img.setData('horizonOffset', -layer.h);
      this.addBeacons(layer.key, layer.factor, layer.depth, layer.h, layer.seed);
    }
  }

  private bakeSkyline(
    key: string,
    tone: string,
    winColor: string,
    height: number,
    minW: number,
    maxW: number,
    seed: number,
  ): void {
    if (this.scene.textures.exists(key)) return;
    const width = VIEW.W;
    const tex = this.scene.textures.createCanvas(key, width, height);
    if (!tex) return;
    const ctx = tex.getContext();
    const rng = new Rng(0xb1d0 + seed);
    ctx.clearRect(0, 0, width, height);

    let x = -40;
    while (x < width + 40) {
      const w = rng.between(minW, maxW);
      const h = rng.between(height * 0.32, height * 0.98);
      const top = height - h;
      ctx.fillStyle = tone;
      ctx.fillRect(x, top, w, h);

      // Roof furniture.
      if (rng.chance(0.4)) {
        const bw = rng.between(8, Math.max(10, w * 0.35));
        ctx.fillRect(x + rng.between(4, Math.max(5, w - bw - 4)), top - rng.between(6, 22), bw, 24);
      }
      if (rng.chance(0.22)) {
        ctx.fillRect(x + w / 2 - 1.5, top - rng.between(20, 62), 3, 62);
      }

      // Window grid.
      const cols = Math.max(1, Math.floor(w / 13));
      const rows = Math.max(1, Math.floor(h / 17));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (!rng.chance(0.42)) continue;
          const wx = x + 5 + c * 13;
          const wy = top + 9 + r * 17;
          if (wx + 5 > x + w - 3 || wy + 7 > height) continue;
          ctx.globalAlpha = rng.between(0.25, 0.9);
          ctx.fillStyle = winColor;
          ctx.fillRect(wx, wy, 5, 7);
        }
      }
      ctx.globalAlpha = 1;
      x += w + rng.between(2, 16);
    }
    tex.refresh();
  }

  private addBeacons(layerKey: string, factor: number, depth: number, height: number, seed: number): void {
    const rng = new Rng(0xbea0 + seed);
    for (let i = 0; i < 3; i++) {
      const beacon = this.scene.add
        .circle(rng.between(80, VIEW.W - 80), -height + rng.between(6, height * 0.4), 2.6, 0xff5a4d, 0.9)
        .setScrollFactor(0, factor)
        .setDepth(depth + 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setName(`${layerKey}-beacon`);
      this.beacons.push(beacon);
    }
  }

  private buildClouds(): void {
    const rng = new Rng(0xc10d);
    for (let i = 0; i < 9; i++) {
      const high = i > 5;
      const img = this.scene.add
        .image(rng.between(0, VIEW.W), rng.between(-60, VIEW.H * 0.9), 'cloud')
        .setScale(rng.between(0.7, 2.1))
        .setAlpha(rng.between(0.16, 0.44))
        .setScrollFactor(0, high ? 0.42 : 0.24)
        .setDepth(high ? DEPTH.cloudNear : DEPTH.cloudFar)
        .setTint(high ? 0xffc8a0 : 0xd8dcff);
      this.clouds.push({ img, speed: rng.between(4, 15) * (rng.chance(0.5) ? 1 : -1) });
    }
  }

  /** Anchor the horizon layers so they sink convincingly as the rig climbs. */
  private positionHorizonPieces(): void {
    const refScroll = floorY(0) - VIEW.H / 2;
    const place = (key: string, screenY: number, factor: number) => {
      const obj = this.scene.children.getByName(key) as Phaser.GameObjects.Image | null;
      if (obj) obj.y = screenY + refScroll * factor;
    };
    place('skylineFar', VIEW.H * 0.58, 0.06);
    place('skylineMid', VIEW.H * 0.66, 0.11);
    place('skylineNear', VIEW.H * 0.74, 0.19);

    this.sun.y = VIEW.H * 0.62 + refScroll * 0.055;
    this.sunDisc.y = this.sun.y;
    this.haze.y = VIEW.H * 0.74 + refScroll * 0.055;
  }

  /**
   * The street exists as a real place in world space: it is only framed during
   * the fall sequence, and the drop needs somewhere to land.
   */
  private buildStreet(): void {
    const rng = new Rng(0x577337);
    const g = this.scene.add.graphics().setDepth(DEPTH.street);

    g.fillStyle(0x0a0d17, 1);
    g.fillRect(-400, STREET_Y - 260, VIEW.W + 800, 900);
    g.fillStyle(0x171c2b, 1);
    g.fillRect(-400, STREET_Y, VIEW.W + 800, 640);
    g.fillStyle(0x0d1120, 1);
    g.fillRect(-400, STREET_Y + 74, VIEW.W + 800, 150);

    // Lane markings.
    g.fillStyle(0x5c6480, 0.55);
    for (let x = -380; x < VIEW.W + 400; x += 66) g.fillRect(x, STREET_Y + 144, 34, 5);

    // Sidewalk kerbs.
    g.fillStyle(0x232a3d, 1);
    g.fillRect(-400, STREET_Y + 66, VIEW.W + 800, 9);
    g.fillRect(-400, STREET_Y + 222, VIEW.W + 800, 9);

    // Traffic and street lamps.
    for (let i = 0; i < 16; i++) {
      const x = rng.between(-300, VIEW.W + 300);
      const y = STREET_Y + rng.between(90, 205);
      const warm = rng.chance(0.5);
      this.scene.add
        .image(x, y, 'glow')
        .setDisplaySize(48, 28)
        .setTint(warm ? 0xffd08a : 0xff6b5a)
        .setAlpha(0.7)
        .setDepth(DEPTH.street + 1)
        .setBlendMode(Phaser.BlendModes.ADD);
    }
    for (let i = 0; i < 10; i++) {
      const x = -260 + i * 180;
      g.fillStyle(0x2b3348, 1);
      g.fillRect(x, STREET_Y - 46, 4, 52);
      this.scene.add
        .image(x + 2, STREET_Y - 48, 'glow')
        .setDisplaySize(120, 96)
        .setTint(0xffcf95)
        .setAlpha(0.35)
        .setDepth(DEPTH.street + 1)
        .setBlendMode(Phaser.BlendModes.ADD);
    }
  }
}
