import Phaser from 'phaser';
import { PANE } from '../config';
import { Rng } from '../core/Rng';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/**
 * The game ships no binary assets. Everything sprite-shaped is baked here into
 * canvas textures once at boot, which keeps the repo asset-free and lets the
 * art scale with the design resolution.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.makeDot();
    this.makeBrush();
    this.makeSoftGlow();
    this.makeGrime();
    this.makeInteriors();
    this.makePaneSheen();
    this.makeSplat();
    this.makeDroplet();
    this.makeShard();
    this.makeFeather();
    this.makeDust();
    this.makeStar();
    this.makeCloud();
    this.makeGrain();
    this.makeVignette();
    this.makeConcreteNoise();

    // Textures are baked; the HTML splash can hand over now.
    window.dispatchEvent(new Event('pane:ready'));

    // Dev affordance: ?start=game skips the menu so a change can be checked in
    // the actual game loop without clicking through the title every time.
    const skipTitle = new URLSearchParams(window.location.search).get('start') === 'game';
    this.scene.start(skipTitle ? 'GameScene' : 'TitleScene');
  }

  private canvas(key: string, w: number, h: number, draw: Draw): void {
    if (this.textures.exists(key)) return;
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    tex.refresh();
  }

  private makeDot(): void {
    this.canvas('px', 4, 4, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    });
  }

  /**
   * Soft round brushes used to erase grime. `cellBrush` is sized to comfortably
   * overlap one scrub cell so neighbouring wipes join into a continuous streak.
   */
  private makeBrush(): void {
    const brush = (key: string, size: number) =>
      this.canvas(key, size, size, (ctx) => {
        const r = size / 2;
        const g = ctx.createRadialGradient(r, r, 0, r, r, r);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.58, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.84, 'rgba(255,255,255,0.42)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(r, r, r, 0, Math.PI * 2);
        ctx.fill();
      });
    brush('brush', 72);
    brush('cellBrush', 40);
  }

  /**
   * Six office interiors seen through the glass. Rooms that are lit give the
   * tower a sense of occupancy, and are where the slapstick comes from.
   */
  private makeInteriors(): void {
    const W = PANE.width;
    const H = PANE.height;
    for (let v = 0; v < 6; v++) {
      const rng = new Rng(0x1a7f + v * 3121);
      const lit = v < 4;
      this.canvas(`interior${v}`, W, H, (ctx) => {
        const wall = ctx.createLinearGradient(0, 0, 0, H);
        if (lit) {
          wall.addColorStop(0, '#4a4534');
          wall.addColorStop(0.45, '#3a3628');
          wall.addColorStop(1, '#22201a');
        } else {
          wall.addColorStop(0, '#141b2a');
          wall.addColorStop(1, '#080c15');
        }
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, W, H);

        if (lit) {
          // Ceiling strip light and its pool of illumination.
          ctx.fillStyle = 'rgba(255,236,182,0.85)';
          ctx.fillRect(W * 0.18, 9, W * 0.64, 6);
          const pool = ctx.createRadialGradient(W / 2, 16, 4, W / 2, 16, H * 0.9);
          pool.addColorStop(0, 'rgba(255,225,160,0.3)');
          pool.addColorStop(1, 'rgba(255,225,160,0)');
          ctx.fillStyle = pool;
          ctx.fillRect(0, 0, W, H);
        }

        // Back wall furniture.
        ctx.fillStyle = lit ? 'rgba(20,17,13,0.75)' : 'rgba(6,9,16,0.9)';
        const deskY = H * rng.between(0.62, 0.72);
        ctx.fillRect(W * rng.between(0.06, 0.16), deskY, W * rng.between(0.42, 0.58), H * 0.05);
        ctx.fillRect(W * 0.1, deskY + H * 0.05, 6, H * 0.2);

        // Monitor.
        const mx = W * rng.between(0.16, 0.42);
        ctx.fillStyle = 'rgba(10,10,14,0.9)';
        ctx.fillRect(mx, deskY - 26, 32, 22);
        ctx.fillStyle = lit ? 'rgba(120,200,255,0.55)' : 'rgba(70,130,180,0.2)';
        ctx.fillRect(mx + 2, deskY - 24, 28, 18);

        // Filing cabinet / plant.
        ctx.fillStyle = 'rgba(18,16,12,0.8)';
        ctx.fillRect(W * 0.78, H * 0.55, W * 0.14, H * 0.4);
        ctx.fillStyle = lit ? 'rgba(46,92,52,0.85)' : 'rgba(18,34,24,0.8)';
        for (let i = 0; i < 5; i++) {
          const px = W * rng.between(0.6, 0.72);
          ctx.beginPath();
          ctx.ellipse(px, H * rng.between(0.58, 0.74), 10, 4, rng.between(-1, 1), 0, Math.PI * 2);
          ctx.fill();
        }

        // A silhouetted occupant, hunched at the desk.
        if (rng.chance(lit ? 0.8 : 0.25)) {
          ctx.fillStyle = 'rgba(8,8,12,0.86)';
          const px = W * rng.between(0.24, 0.56);
          const py = deskY - 4;
          ctx.beginPath();
          ctx.ellipse(px, py - 40, 11, 12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(px - 17, py);
          ctx.quadraticCurveTo(px, py - 40, px + 17, py);
          ctx.fill();
        }

        // Vertical blinds on some rooms.
        if (rng.chance(0.35)) {
          ctx.fillStyle = 'rgba(210,206,190,0.16)';
          for (let x = 4; x < W; x += 11) ctx.fillRect(x, 0, 5, H * rng.between(0.4, 1));
        }
      });
    }
  }

  /** Outer-surface reflection: sky gradient plus two raking highlights. */
  private makePaneSheen(): void {
    this.canvas('paneSheen', PANE.width, PANE.height, (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, 'rgba(150,190,255,0.5)');
      sky.addColorStop(0.5, 'rgba(96,130,200,0.16)');
      sky.addColorStop(1, 'rgba(255,180,120,0.24)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(-0.62);
      const band = (offset: number, width: number, alpha: number) => {
        const g = ctx.createLinearGradient(offset - width, 0, offset + width, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(offset - width, -h, width * 2, h * 2);
      };
      band(-38, 26, 0.4);
      band(24, 12, 0.22);
      ctx.restore();
    });
  }

  private makeSoftGlow(): void {
    const size = 128;
    this.canvas('glow', size, size, (ctx) => {
      const r = size / 2;
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.32)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
  }

  /** Three grime variants so no two panes read identically. */
  private makeGrime(): void {
    for (let v = 0; v < 3; v++) {
      const rng = new Rng(0x6f1e07 + v * 977);
      this.canvas(`grime${v}`, 256, 256, (ctx, w, h) => {
        ctx.fillStyle = 'rgba(86,78,62,0.78)';
        ctx.fillRect(0, 0, w, h);

        // Broad soiling clouds.
        for (let i = 0; i < 90; i++) {
          const x = rng.between(0, w);
          const y = rng.between(0, h);
          const r = rng.between(16, 62);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          const tone = rng.int(48, 84);
          g.addColorStop(0, `rgba(${tone + 18},${tone + 12},${tone - 4},${rng.between(0.1, 0.32)})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }

        // Rain streaks pulling grime downward.
        ctx.lineCap = 'round';
        for (let i = 0; i < 46; i++) {
          const x = rng.between(0, w);
          const y = rng.between(-20, h);
          const len = rng.between(30, 150);
          ctx.strokeStyle = `rgba(38,34,28,${rng.between(0.06, 0.2)})`;
          ctx.lineWidth = rng.between(1, 5);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + rng.between(-6, 6), y + len);
          ctx.stroke();
        }

        // Hard specks.
        for (let i = 0; i < 340; i++) {
          ctx.fillStyle = `rgba(26,22,18,${rng.between(0.12, 0.5)})`;
          const s = rng.between(1, 3.4);
          ctx.fillRect(rng.between(0, w), rng.between(0, h), s, s);
        }

        // Dried edges where water pooled.
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = `rgba(120,110,88,${rng.between(0.08, 0.18)})`;
          ctx.lineWidth = rng.between(3, 9);
          ctx.beginPath();
          ctx.arc(rng.between(0, w), rng.between(0, h), rng.between(30, 90), 0, Math.PI * rng.between(0.6, 1.8));
          ctx.stroke();
        }
      });
    }
  }

  /** Bird dropping: an opaque splat that needs extra scrubbing. */
  private makeSplat(): void {
    const rng = new Rng(0x51a7);
    this.canvas('splat', 96, 96, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = 'rgba(238,238,228,0.95)';
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const r = 20 + Math.sin(a * 3.2) * 6 + Math.cos(a * 5.1) * 4;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.92;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      // Runs and satellite drops.
      ctx.fillStyle = 'rgba(228,230,214,0.85)';
      for (let i = 0; i < 6; i++) {
        const a = rng.between(0, Math.PI * 2);
        const d = rng.between(22, 38);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rng.between(2, 6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(206,200,150,0.8)';
      ctx.beginPath();
      ctx.ellipse(cx + 3, cy + 2, 7, 6, 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private makeDroplet(): void {
    this.canvas('drop', 16, 20, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(200,238,255,0.95)');
      g.addColorStop(1, 'rgba(120,190,235,0.65)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.quadraticCurveTo(w, h * 0.6, w / 2, h);
      ctx.quadraticCurveTo(0, h * 0.6, w / 2, 0);
      ctx.fill();
    });
  }

  private makeShard(): void {
    this.canvas('shard', 24, 24, (ctx) => {
      ctx.fillStyle = 'rgba(196,232,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(22, 15);
      ctx.lineTo(7, 23);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  private makeFeather(): void {
    this.canvas('feather', 26, 12, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(206,213,226,0.92)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,132,152,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(1, h / 2);
      ctx.lineTo(w - 1, h / 2);
      ctx.stroke();
    });
  }

  private makeDust(): void {
    this.canvas('dust', 32, 32, (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(190,180,160,0.85)');
      g.addColorStop(1, 'rgba(190,180,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    });
  }

  private makeStar(): void {
    this.canvas('star', 10, 10, (ctx) => {
      const g = ctx.createRadialGradient(5, 5, 0, 5, 5, 5);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(220,235,255,0.5)');
      g.addColorStop(1, 'rgba(220,235,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 10, 10);
    });
  }

  private makeCloud(): void {
    this.canvas('cloud', 320, 110, (ctx, w, h) => {
      const rng = new Rng(0x1c10ad);
      for (let i = 0; i < 26; i++) {
        const x = rng.between(w * 0.1, w * 0.9);
        const y = h * 0.5 + rng.between(-16, 16);
        const r = rng.between(22, 52);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.3)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
  }

  /** Fine film grain, tiled over the whole frame at low alpha. */
  private makeGrain(): void {
    const rng = new Rng(0x94a1);
    this.canvas('grain', 128, 128, (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = rng.between(120, 255);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = rng.between(0, 46);
      }
      ctx.putImageData(img, 0, 0);
    });
  }

  private makeVignette(): void {
    this.canvas('vignette', 512, 288, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.18, w / 2, h / 2, h * 0.82);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.62, 'rgba(0,0,0,0.18)');
      g.addColorStop(1, 'rgba(2,4,9,0.72)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  /** Subtle mottling laid over the tower so the concrete is not a flat fill. */
  private makeConcreteNoise(): void {
    this.canvas('concreteNoise', 256, 256, (ctx, w, h) => {
      const rng = new Rng(0xc0c0);
      for (let i = 0; i < 900; i++) {
        const x = rng.between(0, w);
        const y = rng.between(0, h);
        const r = rng.between(2, 26);
        ctx.fillStyle = rng.chance(0.5)
          ? `rgba(255,255,255,${rng.between(0.006, 0.028)})`
          : `rgba(0,0,0,${rng.between(0.01, 0.05)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `rgba(0,0,0,${rng.between(0.02, 0.07)})`;
        ctx.lineWidth = rng.between(0.5, 1.6);
        const x = rng.between(0, w);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + rng.between(-10, 10), h);
        ctx.stroke();
      }
    });
  }
}
