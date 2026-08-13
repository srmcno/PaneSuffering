import Phaser from 'phaser';
import { CSS, DEPTH, FONT, PALETTE, VIEW } from '../config';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

/**
 * Every non-diegetic flourish in one place: particles, screen tints, camera
 * kicks and floating text. Gameplay code asks for an effect and never touches
 * an emitter, so the whole feel of the game can be retuned from this file.
 *
 * Emitters are created once, parked at the origin with `emitting: false`, and
 * fired with `emitParticleAt` in world coordinates. Nothing here allocates a
 * game object per hit.
 */
export class Fx {
  private readonly pool: Emitter[] = [];

  private readonly sprayE: Emitter;
  private readonly grimeE: Emitter;
  private readonly sparkleE: Emitter;
  private readonly glassE: Emitter;
  private readonly dustE: Emitter;
  private readonly chipE: Emitter;
  private readonly featherE: Emitter;
  private readonly windE: Emitter;

  /**
   * Read by the emitters' onEmit callbacks. Varying a shared emitter through
   * these is far cheaper than reconfiguring it, and keeps one emitter able to
   * cover both directions or a range of impact strengths.
   */
  private sprayDir = 1;
  private glassPower = 1;
  private windDir = 1;

  private vignette: Phaser.GameObjects.Image | null = null;
  private damage: Phaser.GameObjects.Image | null = null;
  private grain: Phaser.GameObjects.TileSprite | null = null;
  private flashRect: Phaser.GameObjects.Rectangle | null = null;
  private bannerBox: Phaser.GameObjects.Container | null = null;
  private bannerMain: Phaser.GameObjects.Text | null = null;
  private bannerSub: Phaser.GameObjects.Text | null = null;

  private damageLevel = 0;
  private damagePhase = 0;
  private grainT = 0;
  private flashLeft = 0;
  private flashSpan = 1;
  private flashPeak = 0;
  private hitStopLeft = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.sprayE = this.make('drop', {
      lifespan: { min: 220, max: 470 },
      speedX: () => this.sprayDir * Phaser.Math.Between(30, 240),
      speedY: { min: -215, max: 30 },
      gravityY: 820,
      scale: { start: 0.85, end: 0.18 },
      alpha: { start: 0.9, end: 0 },
      rotate: { min: -35, max: 35 },
    });

    this.grimeE = this.make('dust', {
      lifespan: { min: 360, max: 780 },
      speed: { min: 40, max: 210 },
      angle: { min: 195, max: 345 },
      gravityY: 900,
      scale: { start: 0.62, end: 0.12 },
      alpha: { start: 0.95, end: 0 },
      tint: [0x7c6c4a, 0x574d3a, 0x3b352a],
    });

    this.sparkleE = this.make('star', {
      lifespan: { min: 320, max: 700 },
      speed: { min: 20, max: 135 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xdff3ff, PALETTE.amber],
      blendMode: 'ADD',
    });

    this.glassE = this.make('shard', {
      lifespan: { min: 700, max: 1500 },
      speed: () => Phaser.Math.Between(120, 430) * this.glassPower,
      angle: { min: 0, max: 360 },
      gravityY: 1150,
      scale: { min: 0.45, max: 1.15 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 420 },
      tint: [0xffffff, 0xc8e6ff, 0x8fb6d8],
    });

    this.dustE = this.make('dust', {
      lifespan: { min: 420, max: 940 },
      speed: { min: 30, max: 190 },
      angle: { min: 200, max: 340 },
      gravityY: 240,
      scale: { start: 0.5, end: 1.6 },
      alpha: { start: 0.6, end: 0 },
      tint: [0xb9b3a4, 0x8e8778, 0x6a6558],
    });

    this.chipE = this.make('px', {
      lifespan: { min: 480, max: 1000 },
      speed: { min: 130, max: 430 },
      angle: { min: 190, max: 350 },
      gravityY: 1300,
      scale: { min: 0.8, max: 2.4 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [PALETTE.concreteLight, PALETTE.concrete, PALETTE.concreteDark],
    });

    this.featherE = this.make('feather', {
      lifespan: { min: 1400, max: 2600 },
      speedX: { min: -160, max: 160 },
      speedY: { min: -230, max: -40 },
      accelerationX: { min: -70, max: 70 },
      gravityY: 62,
      // Terminal velocity: feathers must flutter down, not drop like ballast.
      maxVelocityY: 95,
      scale: { min: 0.7, max: 1.25 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 280 },
    });

    // Screen-space, so it sits above the world but under the vignette.
    this.windE = this.make(
      'px',
      {
        lifespan: { min: 250, max: 520 },
        speedX: () => this.windDir * Phaser.Math.Between(950, 1950),
        speedY: { min: -30, max: 30 },
        scaleX: { min: 6, max: 26 },
        scaleY: { min: 0.25, max: 0.85 },
        alpha: { start: 0.42, end: 0 },
        tint: [0xdfe9ff, 0xa8c4ff],
        blendMode: 'ADD',
      },
      DEPTH.overlay - 1,
    );
    this.windE.setScrollFactor(0);
  }

  /* ------------------------------------------------------------ particles */

  /** Water/soap spray where the squeegee is working. */
  spray(x: number, y: number, dirX: number): void {
    this.sprayDir = dirX < 0 ? -1 : 1;
    this.sprayE.emitParticleAt(x, y, 2);
  }

  /** Grime flicking off a wiped pane. */
  grimeBurst(x: number, y: number): void {
    this.grimeE.emitParticleAt(x, y, 9);
  }

  /** Sparkle when a pane goes spotless. */
  sparkle(x: number, y: number): void {
    this.sparkleE.emitParticleAt(x, y, 16);
  }

  /** Glass shards from a broken window. */
  glass(x: number, y: number, power = 1): void {
    this.glassPower = Phaser.Math.Clamp(power, 0.25, 3);
    this.glassE.emitParticleAt(x, y, Math.round(8 + this.glassPower * 10));
    this.dustE.emitParticleAt(x, y, 4);
  }

  /** Dust/concrete chips from an impact. */
  impact(x: number, y: number): void {
    this.dustE.emitParticleAt(x, y, 8);
    this.chipE.emitParticleAt(x, y, 6);
  }

  /** Feathers when a pigeon is disturbed. */
  feathers(x: number, y: number): void {
    this.featherE.emitParticleAt(x, y, 10);
  }

  /** Streaking wind lines across the screen; `dir` is -1 or 1. */
  windStreaks(dir: number, strength: number): void {
    this.windDir = dir < 0 ? -1 : 1;
    const s = Phaser.Math.Clamp(strength, 0, 1);
    const count = Math.round(4 + s * 18);
    const x = this.windDir > 0 ? -60 : VIEW.W + 60;
    for (let i = 0; i < count; i++) {
      this.windE.emitParticleAt(x, Phaser.Math.Between(16, VIEW.H - 16), 1);
    }
  }

  /* ----------------------------------------------------------------- text */

  /** Floating score/label popup in world space. */
  popup(x: number, y: number, text: string, color: string = CSS.paper): void {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: '700',
        color,
        stroke: CSS.ink,
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.particles + 1);

    this.scene.tweens.add({
      targets: label,
      y: y - 64,
      alpha: 0,
      scale: { from: 0.7, to: 1.08 },
      ease: 'Quad.easeOut',
      duration: 880,
      onComplete: () => label.destroy(),
    });
  }

  /** Big centred announcement banner, e.g. hazard warnings. */
  banner(text: string, color: string = CSS.amber, subtitle?: string): void {
    const box = this.ensureBanner();
    if (!this.bannerMain || !this.bannerSub) return;

    // A second warning replaces the first outright; stacked banners read as a
    // bug, and the newer hazard is always the one worth looking at.
    this.scene.tweens.killTweensOf(box);

    this.bannerMain.setText(text).setColor(color);
    this.bannerSub.setText(subtitle ?? '').setVisible(!!subtitle);
    box.setAlpha(0).setScale(0.82).setVisible(true);

    this.scene.tweens.add({
      targets: box,
      alpha: 1,
      scale: 1,
      ease: 'Back.easeOut',
      duration: 210,
    });
    this.scene.tweens.add({
      targets: box,
      alpha: 0,
      scale: 1.06,
      ease: 'Quad.easeIn',
      delay: 1250,
      duration: 300,
    });
  }

  /* --------------------------------------------------------------- screen */

  /** Camera shake with a normalised 0..1 intensity. */
  shake(intensity: number, durationMs = 240): void {
    const amp = 0.002 + Phaser.Math.Clamp(intensity, 0, 1) * 0.02;
    const effect = this.scene.cameras.main.shakeEffect;
    // Let the biggest hit own the screen instead of the first one to land.
    if (effect.isRunning && effect.intensity.x >= amp) return;
    this.scene.cameras.main.shake(durationMs, amp, true);
  }

  /** Brief slow-motion on a big hit. */
  hitStop(scale = 0.3, durationMs = 90): void {
    const wanted = Phaser.Math.Clamp(scale, 0.05, 1);
    const s = this.hitStopLeft > 0 ? Math.min(this.scene.time.timeScale, wanted) : wanted;
    this.hitStopLeft = Math.max(this.hitStopLeft, durationMs / 1000);
    this.scene.time.timeScale = s;
    this.scene.tweens.timeScale = s;
  }

  /** Full-screen colour flash. */
  flash(color: number, alpha = 0.5, durationMs = 180): void {
    const rect = this.ensureFlash();
    rect.setFillStyle(color, 1);
    this.flashPeak = Phaser.Math.Clamp(alpha, 0, 1);
    this.flashSpan = Math.max(0.016, durationMs / 1000);
    this.flashLeft = this.flashSpan;
    rect.setAlpha(this.flashPeak);
  }

  /** Vignette + film grain overlay; call once during scene setup. */
  addScreenOverlays(): void {
    if (this.vignette) return;

    this.vignette = this.scene.add
      .image(VIEW.W / 2, VIEW.H / 2, 'vignette')
      .setDisplaySize(VIEW.W, VIEW.H)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay)
      .setAlpha(0.9);

    this.damage = this.scene.add
      .image(VIEW.W / 2, VIEW.H / 2, 'vignette')
      .setDisplaySize(VIEW.W, VIEW.H)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay + 1)
      .setTint(PALETTE.danger)
      .setAlpha(0);

    this.grain = this.scene.add
      .tileSprite(0, 0, VIEW.W, VIEW.H, 'grain')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay + 2)
      .setAlpha(0.055);
  }

  /** A red damage vignette that pulses; 0..1. */
  setDamageLevel(level: number): void {
    this.damageLevel = Phaser.Math.Clamp(level, 0, 1);
  }

  /** Drives grain scroll and any timed overlays. */
  update(dt: number): void {
    if (this.hitStopLeft > 0) {
      // Counted in real frame time: the clock we just slowed down cannot be
      // trusted to measure its own recovery.
      this.hitStopLeft -= this.scene.game.loop.delta / 1000;
      if (this.hitStopLeft <= 0) {
        this.hitStopLeft = 0;
        this.scene.time.timeScale = 1;
        this.scene.tweens.timeScale = 1;
      }
    }

    if (this.grain) {
      // Jittered rather than panned: grain that slides steadily reads as dirt
      // on the lens instead of film.
      this.grainT += dt;
      this.grain.tilePositionX = Math.sin(this.grainT * 37.1) * 64;
      this.grain.tilePositionY = Math.cos(this.grainT * 28.7) * 64;
    }

    if (this.damage) {
      this.damagePhase += dt * (2.4 + this.damageLevel * 6);
      const pulse = 0.72 + 0.28 * Math.sin(this.damagePhase);
      const alpha = this.damageLevel * 0.85 * pulse;
      // A transparent full-screen quad still costs fill rate, so switch it off.
      this.damage.setAlpha(alpha).setVisible(alpha > 0.004);
    }

    if (this.flashRect) {
      if (this.flashLeft > 0) {
        this.flashLeft = Math.max(0, this.flashLeft - dt);
        this.flashRect.setAlpha(this.flashPeak * (this.flashLeft / this.flashSpan));
      }
      this.flashRect.setVisible(this.flashLeft > 0);
    }
  }

  destroy(): void {
    for (const emitter of this.pool) emitter.destroy();
    this.pool.length = 0;

    if (this.bannerBox) this.scene.tweens.killTweensOf(this.bannerBox);
    this.bannerBox?.destroy();
    this.vignette?.destroy();
    this.damage?.destroy();
    this.grain?.destroy();
    this.flashRect?.destroy();
    this.bannerBox = null;
    this.bannerMain = null;
    this.bannerSub = null;
    this.vignette = null;
    this.damage = null;
    this.grain = null;
    this.flashRect = null;

    // Never hand a slowed clock back to the next scene.
    this.scene.time.timeScale = 1;
    this.scene.tweens.timeScale = 1;
    this.hitStopLeft = 0;
  }

  /* ---------------------------------------------------------------- build */

  private make(texture: string, config: EmitterConfig, depth: number = DEPTH.particles): Emitter {
    const emitter = this.scene.add.particles(0, 0, texture, { emitting: false, ...config });
    emitter.setDepth(depth);
    this.pool.push(emitter);
    return emitter;
  }

  private ensureFlash(): Phaser.GameObjects.Rectangle {
    if (!this.flashRect) {
      this.flashRect = this.scene.add
        .rectangle(0, 0, VIEW.W, VIEW.H, 0xffffff, 1)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(DEPTH.overlay + 3)
        .setAlpha(0);
    }
    return this.flashRect;
  }

  private ensureBanner(): Phaser.GameObjects.Container {
    if (!this.bannerBox) {
      this.bannerMain = this.scene.add
        .text(0, 0, '', {
          fontFamily: FONT,
          fontSize: '54px',
          fontStyle: '800',
          color: CSS.amber,
          stroke: CSS.ink,
          strokeThickness: 8,
          align: 'center',
        })
        .setOrigin(0.5);

      this.bannerSub = this.scene.add
        .text(0, 46, '', {
          fontFamily: FONT,
          fontSize: '22px',
          color: CSS.dim,
          stroke: CSS.ink,
          strokeThickness: 5,
          align: 'center',
        })
        .setOrigin(0.5);

      this.bannerBox = this.scene.add
        .container(VIEW.W / 2, VIEW.H * 0.32, [this.bannerMain, this.bannerSub])
        .setScrollFactor(0)
        .setDepth(DEPTH.overlay + 4)
        .setAlpha(0);
    }
    return this.bannerBox;
  }
}
