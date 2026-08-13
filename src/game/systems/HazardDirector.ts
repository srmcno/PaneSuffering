import Phaser from 'phaser';
import { FLOOR_COUNT } from '../config';
import { audio } from '../audio/AudioEngine';
import { Debris } from '../hazards/Debris';
import { Defenestration } from '../hazards/Defenestration';
import { Hazard, HazardContext } from '../hazards/Hazard';
import { Pigeon } from '../hazards/Pigeon';
import { Projectile } from '../hazards/Projectile';
import { SwingWindow } from '../hazards/SwingWindow';
import { DeckLoad } from './RigSim';

interface HurlEvent {
  x: number;
  y: number;
  vx: number;
}

const MAX_CONCURRENT = 5;

/**
 * Decides what goes wrong and when. Everything it spawns is telegraphed, the
 * concurrent count is capped, and the rate is cut while the rig is in transit,
 * so escalation stays legible instead of just becoming noise.
 */
export class HazardDirector {
  /** Signed wind strength, -1..1, surfaced to the HUD. */
  wind = 0;

  private hazards: Hazard[] = [];
  private spawnTimer = 4.5;
  private gustTimer = 9;
  private gustPhase: 'idle' | 'warn' | 'blow' = 'idle';
  private gustT = 0;
  private gustDir: -1 | 1 = 1;
  private gustPower = 0;
  private drift = 0;
  private noiseT = Math.random() * 100;
  private finale: Defenestration | null = null;
  private finaleFired = false;

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.on('hazard:hurl', this.onHurl, this);
  }

  get finaleActive(): boolean {
    return this.finale !== null;
  }

  get finaleComplete(): boolean {
    return this.finaleFired && this.finale === null;
  }

  /** Loads that hazards are currently putting on the deck. */
  get deckLoads(): DeckLoad[] {
    const loads: DeckLoad[] = [];
    for (const h of this.hazards) if (h.load) loads.push(h.load);
    return loads;
  }

  update(dt: number, ctx: HazardContext, ascending: boolean): void {
    this.updateWind(dt, ctx);

    if (!ascending) {
      this.spawnTimer -= dt * (this.finale?.stormActive ? 3.4 : 1);
      if (this.spawnTimer <= 0) {
        this.spawn(ctx);
        this.spawnTimer = this.nextInterval(ctx.floor);
      }
    } else {
      this.spawnTimer = Math.max(this.spawnTimer, 1.4);
    }

    for (const hazard of this.hazards) hazard.update(dt, ctx);

    const survivors: Hazard[] = [];
    for (const hazard of this.hazards) {
      if (hazard.alive) survivors.push(hazard);
      else if (hazard === this.finale) this.finale = null;
    }
    this.hazards = survivors;
  }

  /** Fires the penthouse set-piece. Safe to call more than once. */
  startFinale(ctx: HazardContext): void {
    if (this.finaleFired) return;
    this.finaleFired = true;
    const panes = ctx.tower.panesOnFloor(ctx.floor);
    const pane = panes[Math.min(panes.length - 1, Math.max(0, Math.floor(panes.length / 2)))];
    if (!pane) return;
    this.finale = new Defenestration(this.scene, ctx, pane);
    this.hazards.push(this.finale);
  }

  clear(): void {
    this.scene.events.off('hazard:hurl', this.onHurl, this);
    for (const hazard of this.hazards) hazard.destroy();
    this.hazards = [];
    this.finale = null;
  }

  /* ------------------------------------------------------------------ wind */

  private updateWind(dt: number, ctx: HazardContext): void {
    this.noiseT += dt;
    // Layered sines read as gentle, unrepeating weather without a noise table.
    this.drift =
      Math.sin(this.noiseT * 0.31) * 0.42 +
      Math.sin(this.noiseT * 0.13 + 1.7) * 0.3 +
      Math.sin(this.noiseT * 0.72 + 3.1) * 0.12;

    const altitude = ctx.floor / Math.max(1, FLOOR_COUNT - 1);

    switch (this.gustPhase) {
      case 'idle':
        this.gustTimer -= dt;
        if (this.gustTimer <= 0) {
          this.gustPhase = 'warn';
          this.gustT = 0;
          this.gustDir = Math.random() < 0.5 ? -1 : 1;
          this.gustPower = 0.55 + altitude * 0.75;
          audio.play('gust', { volume: 0.5 });
          ctx.fx.banner('GUST INCOMING', '#8fd6ff', this.gustDir > 0 ? 'from the west' : 'from the east');
        }
        break;

      case 'warn':
        this.gustT += dt;
        if (this.gustT > 1.15) {
          this.gustPhase = 'blow';
          this.gustT = 0;
          audio.play('gust', { volume: 0.95 });
          ctx.fx.windStreaks(this.gustDir, this.gustPower);
          ctx.sim.addSwayImpulse(this.gustDir * 70 * this.gustPower);
          ctx.sim.addImpulse(this.gustDir * 14 * this.gustPower);
        }
        break;

      case 'blow': {
        this.gustT += dt;
        if (Math.random() < dt * 3) ctx.fx.windStreaks(this.gustDir, this.gustPower * 0.6);
        if (this.gustT > 1.8) {
          this.gustPhase = 'idle';
          this.gustTimer = Phaser.Math.FloatBetween(11, 18) - altitude * 5;
        }
        break;
      }
    }

    const gustNow =
      this.gustPhase === 'blow' ? this.gustDir * this.gustPower * (1 - this.gustT / 1.8) : 0;
    this.wind = Phaser.Math.Clamp(this.drift * (0.25 + altitude * 0.55) + gustNow, -1.4, 1.4);

    // Wind pushes the platform sideways and twists it a little.
    ctx.sim.addForce(this.wind * (60 + altitude * 110));
    ctx.sim.addTorque(this.wind * (3 + altitude * 7));
  }

  /* ---------------------------------------------------------------- spawns */

  private nextInterval(floor: number): number {
    const t = floor / Math.max(1, FLOOR_COUNT - 1);
    const base = Phaser.Math.Linear(4.6, 2.0, t);
    return base * Phaser.Math.FloatBetween(0.72, 1.3);
  }

  private spawn(ctx: HazardContext): void {
    if (this.hazards.length >= MAX_CONCURRENT) return;

    const f = ctx.floor;
    const options: Array<{ weight: number; make: () => Hazard | null }> = [
      {
        weight: 3.2 - f * 0.12,
        make: () => new Pigeon(this.scene, ctx),
      },
      {
        weight: 2 + f * 0.45,
        make: () => new Debris(this.scene, ctx, false),
      },
      {
        weight: f < 2 ? 0 : (f - 1) * 0.62,
        make: () => new Debris(this.scene, ctx, true),
      },
      {
        weight: f < 1 ? 0 : 1.4 + f * 0.38,
        make: () => {
          const panes = ctx.tower.panesOnFloor(f);
          if (panes.length === 0) return null;
          return new SwingWindow(this.scene, ctx, panes[Phaser.Math.Between(0, panes.length - 1)]);
        },
      },
    ];

    const total = options.reduce((sum, o) => sum + Math.max(0, o.weight), 0);
    if (total <= 0) return;

    let roll = Math.random() * total;
    for (const option of options) {
      roll -= Math.max(0, option.weight);
      if (roll <= 0) {
        const hazard = option.make();
        if (hazard) this.hazards.push(hazard);
        return;
      }
    }
  }

  private onHurl(data: HurlEvent): void {
    if (this.hazards.length >= MAX_CONCURRENT + 2) return;
    this.hazards.push(new Projectile(this.scene, data.x, data.y, data.vx));
  }
}
