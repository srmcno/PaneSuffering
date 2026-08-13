import Phaser from 'phaser';
import {
  FLOOR_COUNT,
  PANE,
  ROOF_Y,
  RULES,
  SIM,
  SQUEEGEE,
  STREET_Y,
  VIEW,
  deckY,
} from '../config';
import { audio } from '../audio/AudioEngine';
import { Rig } from '../entities/Rig';
import { Washer } from '../entities/Washer';
import { HazardContext } from '../hazards/Hazard';
import { Fx } from '../systems/Fx';
import { HazardDirector } from '../systems/HazardDirector';
import { InputSystem } from '../systems/InputSystem';
import { RigSim } from '../systems/RigSim';
import { Save } from '../systems/Save';
import { ScoreSystem } from '../systems/ScoreSystem';
import { HudState, InputIntent, RunSummary, ToastTone } from '../types/GameTypes';
import { Backdrop } from '../world/Backdrop';
import { Tower } from '../world/Tower';

type Mode = 'work' | 'ascend' | 'finale' | 'dying' | 'falling' | 'over';

export class GameScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private tower!: Tower;
  private sim!: RigSim;
  private rig!: Rig;
  private washer!: Washer;
  private fx!: Fx;
  private controls!: InputSystem;
  private hazards!: HazardDirector;
  private score!: ScoreSystem;

  private mode: Mode = 'work';
  private floor = 0;
  private floorsCleared = 0;
  private floorStart = 0;
  private elapsed = 0;
  private soap: number = RULES.soapCapacity;
  private safetyCooldown = 0;
  private winchReady = false;
  private alarmTimer = 0;
  private outcomeTimer = 0;
  private endReason = '';
  private tutorialStep = 0;
  private sawFirstTilt = false;
  private sawDrySoap = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetState();

    this.backdrop = new Backdrop(this);
    this.tower = new Tower(this);
    this.sim = new RigSim(0);
    this.rig = new Rig(this, this.sim);
    this.washer = new Washer(this);
    this.fx = new Fx(this);
    this.score = new ScoreSystem();
    this.controls = new InputSystem(this);
    this.hazards = new HazardDirector(this);

    this.fx.addScreenOverlays();

    const cam = this.cameras.main;
    cam.setBounds(0, ROOF_Y - 520, VIEW.W, STREET_Y + 700 - (ROOF_Y - 520));
    cam.setScroll(0, this.desiredScrollY());
    cam.fadeIn(420, 4, 6, 12);
    this.tower.update(cam.scrollY, VIEW.H);

    this.scene.launch('UIScene');
    this.wireSceneEvents();

    audio.unlock();
    audio.startMusic();
    this.toast('Floor 41. Four panes. HOLD SPACE to work the squeegee.', 'info');
  }

  update(_time: number, deltaMs: number): void {
    // Clamp so a stalled tab cannot teleport the simulation.
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    const intent = this.controls.getIntent();

    if (intent.mutePressed) {
      const muted = audio.toggleMute();
      this.toast(muted ? 'Audio muted.' : 'Audio on.', 'info');
    }
    if (intent.pausePressed && this.mode !== 'over') {
      this.openPause();
      return;
    }

    if (this.mode === 'falling') {
      this.updateFalling(dt);
      return;
    }
    if (this.mode === 'over') return;

    this.elapsed += dt;

    if (this.mode === 'dying') {
      this.outcomeTimer -= dt;
      this.washer.update(dt, this.sim, this.idleIntent(), {
        slippery: false,
        canClean: false,
        frozen: true,
      });
      this.sim.update(dt, [this.washer.load], 0, 0);
      this.rig.update(dt, Rig.danger(this.sim));
      this.followCamera(dt);
      this.fx.update(dt);
      if (this.outcomeTimer <= 0) this.finish(false, this.endReason);
      return;
    }

    this.updateSafetyLine(dt, intent);
    this.updateWinch(intent);
    this.updateSoap(dt, intent);

    const ctx = this.hazardContext();
    this.hazards.update(dt, ctx, this.mode === 'ascend');

    const loads = this.hazards.deckLoads;
    loads.push(this.washer.load);
    this.sim.update(dt, loads, this.washer.brace, 0);

    this.washer.update(dt, this.sim, intent, {
      slippery: this.soap <= 0 ? false : this.washer.isCleaning,
      canClean: this.mode !== 'ascend',
      frozen: false,
    });

    if (this.washer.isCleaning) this.applyCleaning(dt);
    else audio.setSqueegee(false, 0);

    this.updateFloorGoal();
    this.updateFeedback(dt);
    this.rig.update(dt, Rig.danger(this.sim));
    this.backdrop.update(dt, this.floor / Math.max(1, FLOOR_COUNT - 1));
    this.followCamera(dt);
    this.tower.update(this.cameras.main.scrollY, VIEW.H);
    this.fx.update(dt);
    this.emitHud();
    this.checkFailure();

    audio.update(dt, {
      wind: Phaser.Math.Clamp(Math.abs(this.hazards.wind) * 0.7 + this.floor / FLOOR_COUNT / 2, 0, 1),
      intensity: this.musicIntensity(),
    });
  }

  /* ------------------------------------------------------------- lifecycle */

  private resetState(): void {
    this.ctxCache = null;
    this.mode = 'work';
    this.floor = 0;
    this.floorsCleared = 0;
    this.floorStart = 0;
    this.elapsed = 0;
    this.soap = RULES.soapCapacity;
    this.safetyCooldown = 0;
    this.winchReady = false;
    this.alarmTimer = 0;
    this.outcomeTimer = 0;
    this.endReason = '';
    this.tutorialStep = 0;
    this.sawFirstTilt = false;
    this.sawDrySoap = false;
  }

  private wireSceneEvents(): void {
    this.events.on('resume-request', this.resumeFromPause, this);
    this.events.on('resume', this.resumeFromPause, this);
    this.events.on('restart', this.restartRun, this);
    this.events.on('quit', this.quitToTitle, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  private teardown(): void {
    audio.setSqueegee(false, 0);
    audio.setWinch(false);
    this.events.off('resume-request', this.resumeFromPause, this);
    this.events.off('resume', this.resumeFromPause, this);
    this.events.off('restart', this.restartRun, this);
    this.events.off('quit', this.quitToTitle, this);
    this.hazards?.clear();
    this.controls?.destroy();
    this.fx?.destroy();
    this.tower?.destroy();
    this.rig?.destroy();
    this.washer?.destroy();
  }

  private openPause(): void {
    audio.setSqueegee(false, 0);
    audio.setWinch(false);
    audio.play('click');
    this.scene.pause();
    this.scene.launch('PauseScene');
  }

  private resumeFromPause(): void {
    this.scene.resume();
  }

  private restartRun(): void {
    this.scene.resume();
    this.scene.stop('UIScene');
    this.scene.stop('PauseScene');
    this.scene.restart();
  }

  private quitToTitle(): void {
    this.scene.resume();
    this.scene.stop('UIScene');
    this.scene.stop('PauseScene');
    this.scene.start('TitleScene');
  }

  /* ---------------------------------------------------------------- systems */

  private ctxCache: HazardContext | null = null;

  /** Rebuilt only when the floor changes; otherwise it is the same object. */
  private hazardContext(): HazardContext {
    if (this.ctxCache && this.ctxCache.floor === this.floor) return this.ctxCache;
    this.ctxCache = {
      scene: this,
      sim: this.sim,
      washer: this.washer,
      tower: this.tower,
      fx: this.fx,
      floor: this.floor,
      hit: (damage, knock, source) => this.onHit(damage, knock, source),
      closeShave: (x, y) => this.onCloseShave(x, y),
    };
    return this.ctxCache;
  }

  private idleIntent(): InputIntent {
    return {
      move: 0,
      crouchHeld: false,
      cleanHeld: false,
      winchHeld: false,
      safetyPressed: false,
      pausePressed: false,
      mutePressed: false,
      anyTapped: false,
    };
  }

  private onHit(damage: number, knock: number, source: string): void {
    if (!this.washer.hurt(damage, knock)) return;
    this.score.takeDamage();
    this.fx.shake(Math.min(1, damage / 26), 220);
    this.fx.flash(0xff4a3a, 0.24, 160);
    this.fx.hitStop(0.35, 90);
    this.fx.popup(this.sim.worldX + this.washer.localX, this.sim.surfaceY - 110, `-${damage}`, '#ff5a4d');
    audio.play('bodyHit', { volume: Math.min(1, 0.5 + damage / 40) });
    void source;
  }

  private onCloseShave(x: number, y: number): void {
    const points = this.score.closeShave();
    this.fx.popup(x, y, `CLOSE SHAVE +${points}`, '#8fd6ff');
    audio.play('sparkle', { volume: 0.5 });
  }

  private updateSafetyLine(dt: number, intent: InputIntent): void {
    this.safetyCooldown = Math.max(0, this.safetyCooldown - dt);
    if (!intent.safetyPressed || this.safetyCooldown > 0) return;

    this.safetyCooldown = RULES.safetyLineCooldown;
    // Snap the deck level, kill the swing, and grant a moment of grace.
    this.sim.angVel *= 0.08;
    this.sim.angle *= 0.3;
    this.sim.swayVX *= 0.2;
    this.washer.grantInvulnerability(RULES.safetyLineInvuln);
    this.washer.recover();
    this.fx.flash(0x9fd8ff, 0.32, 200);
    this.fx.shake(0.2, 140);
    this.fx.popup(this.sim.worldX, this.sim.surfaceY - 130, 'SAFETY LINE', '#8fd6ff');
    audio.play('ratchet', { volume: 0.9 });
    audio.play('chime', { volume: 0.5 });
  }

  private updateWinch(intent: InputIntent): void {
    if (this.mode === 'ascend') {
      if (this.sim.atTarget) {
        this.sim.winching = false;
        this.mode = 'work';
        this.floorStart = this.elapsed;
        audio.setWinch(false);
        audio.play('thud', { volume: 0.5, detune: 120 });
        this.toast(`Floor ${41 + this.floor}. ${PANE.perFloor} panes.`, 'info');
        if (this.floor === 1) {
          this.toast('SHIFT snaps the safety line: levels the deck and buys you a second.', 'good');
        }
        if (this.floor === FLOOR_COUNT - 1) {
          this.toast('Penthouse. Whatever is going on in there, finish the glass.', 'warn');
        }
      }
      return;
    }

    if (this.winchReady && intent.winchHeld && this.mode === 'work') {
      this.beginAscent();
    }
  }

  private beginAscent(): void {
    const points = this.score.finishFloor(this.floor, this.elapsed - this.floorStart);
    this.fx.popup(this.sim.worldX, this.sim.surfaceY - 150, `FLOOR CLEAR +${points}`, '#5ce8a0');
    this.floorsCleared++;
    this.winchReady = false;
    this.floor++;
    this.mode = 'ascend';
    this.sim.setTargetFloor(this.floor);
    this.sim.winching = true;
    this.sim.addBob(-16);
    audio.setWinch(true);
    audio.play('ratchet', { volume: 0.6 });
    this.fx.banner('ASCENDING', '#f6b73c', `floor ${41 + this.floor}`);
  }

  private updateSoap(dt: number, intent: InputIntent): void {
    const nearBucket = Math.abs(this.washer.localX + 182) < 110;
    if (this.washer.isCleaning && this.soap > 0) {
      this.soap = Math.max(0, this.soap - RULES.soapDrain * dt);
      if (this.soap <= 0) {
        audio.play('buzz', { volume: 0.4 });
        this.toast('Bucket dry. Step left to the bucket to refill.', 'warn');
        this.sawDrySoap = true;
      }
    } else if (nearBucket && !intent.cleanHeld) {
      const before = this.soap;
      this.soap = Math.min(RULES.soapCapacity, this.soap + RULES.soapRefill * dt);
      if (before < RULES.soapCapacity && this.soap >= RULES.soapCapacity) {
        audio.play('chime', { volume: 0.4 });
      }
    }

    if (!this.sawDrySoap && this.soap < RULES.soapCapacity * 0.25) {
      this.sawDrySoap = true;
      this.toast('Soap running low — the bucket is at the left end of the deck.', 'warn');
    }
  }

  /** Convert squeegee position into actual erased grime and score. */
  private applyCleaning(dt: number): void {
    const wet = this.soap > 0;
    const power = SQUEEGEE.power * (wet ? 1 : RULES.drySqueegeeScale) * dt;
    const panes = this.tower.panesOnFloor(this.floor);
    let gained = 0;

    for (const dx of [-SQUEEGEE.bladeHalfWidth, 0, SQUEEGEE.bladeHalfWidth]) {
      const p = this.sim.pointAt(this.washer.bladeX + dx, this.washer.bladeLift);
      for (const pane of panes) {
        if (Math.abs(pane.cx - p.x) > PANE.width / 2 + SQUEEGEE.sampleRadius) continue;
        gained += pane.scrub(p.x, p.y, SQUEEGEE.sampleRadius, power);
      }
    }

    const blade = this.sim.pointAt(this.washer.bladeX, this.washer.bladeLift);
    audio.setSqueegee(true, wet ? 0.35 + Math.abs(Math.sin(this.elapsed * 6)) * 0.5 : 0.95);

    if (gained > 0) {
      this.score.addScrub(gained);
      if (Math.random() < 0.55) this.fx.spray(blade.x, blade.y, this.washer.facing);
      if (Math.random() < 0.25) this.fx.grimeBurst(blade.x, blade.y + 14);
      if (this.tutorialStep === 0) {
        this.tutorialStep = 1;
        this.toast('Walk with A / D to sweep the blade across the glass.', 'info');
      }
    } else if (!wet && Math.random() < dt * 3) {
      this.fx.popup(blade.x, blade.y, 'squeak', '#8e9bb3');
    }

    for (const pane of panes) {
      if (pane.progress >= RULES.floorTarget && !pane.bonusPaid) {
        pane.bonusPaid = true;
        const points = this.score.finishPane();
        this.fx.popup(pane.cx, pane.cy, `+${points}`, '#5ce8a0');
        audio.play('chime', { volume: 0.55 });
      }
      if (pane.spotless && !pane.spotlessPaid) {
        pane.spotlessPaid = true;
        const points = this.score.finishSpotless();
        this.fx.sparkle(pane.cx, pane.cy);
        this.fx.popup(pane.cx, pane.cy - 46, `SPOTLESS +${points}`, '#8fd6ff');
        audio.play('sparkle', { volume: 0.8 });
      }
    }
  }

  private updateFloorGoal(): void {
    if (this.mode !== 'work') return;
    const progress = this.tower.floorProgress(this.floor);

    if (this.floor >= FLOOR_COUNT - 1) {
      if (progress >= RULES.floorTarget && !this.hazards.finaleActive && !this.hazards.finaleComplete) {
        this.mode = 'finale';
        this.hazards.startFinale(this.hazardContext());
      }
      return;
    }

    if (progress >= RULES.floorTarget && !this.winchReady) {
      this.winchReady = true;
      audio.play('confirm', { volume: 0.8 });
      this.fx.banner('FLOOR CLEAR', '#5ce8a0', 'HOLD W to winch up');
      this.toast('Floor signed off. HOLD W to winch up to the next one.', 'good');
    }
  }

  private updateFeedback(dt: number): void {
    const danger = Rig.danger(this.sim);
    this.fx.setDamageLevel(1 - this.washer.health / RULES.maxHealth);

    // A rising alarm as the deck approaches the dump angle.
    if (danger > 0.62) {
      this.alarmTimer -= dt * (danger * 3);
      if (this.alarmTimer <= 0) {
        this.alarmTimer = 1;
        audio.play('alarm', { volume: 0.35 + danger * 0.35 });
      }
    } else {
      this.alarmTimer = 0;
    }

    if (!this.sawFirstTilt && Math.abs(this.sim.angle) > 0.17) {
      this.sawFirstTilt = true;
      this.toast('The deck tips under your weight. HOLD S to crouch and brace.', 'warn');
    }

    if (this.sim.clangedThisFrame) {
      audio.play('thud', { volume: 0.5, detune: 340 });
      this.fx.shake(0.16, 120);
    }

    if (this.washer.state === 'hang') {
      this.events.emit('grab', {
        active: true,
        progress: this.washer.hangTaps / RULES.grabTaps,
        timeLeft: Math.max(0, this.washer.hangTimer),
      });
    } else {
      this.events.emit('grab', { active: false, progress: 0, timeLeft: 0 });
    }

    if (this.mode === 'finale' && this.hazards.finaleComplete) {
      this.floorsCleared = FLOOR_COUNT;
      this.score.bonus(1500);
      this.finish(true, 'Penthouse survived. Shift complete.');
    }
  }

  private checkFailure(): void {
    if (this.washer.state === 'fall' && this.mode !== 'falling') {
      this.beginFallSequence();
      return;
    }
    if (this.washer.health <= 0 && this.mode !== 'dying') {
      this.mode = 'dying';
      this.outcomeTimer = 1.5;
      this.endReason = 'Stretchered off with a full complement of workplace injuries.';
      audio.setSqueegee(false, 0);
      audio.stopMusic();
      audio.play('stinger', { volume: 1 });
      this.fx.banner('SHIFT OVER', '#ff5a4d', 'medical are on their way up');
      this.fx.flash(0xff3a2a, 0.4, 300);
      this.fx.shake(0.9, 500);
    }
  }

  /* ----------------------------------------------------------------- fall */

  private beginFallSequence(): void {
    this.mode = 'falling';
    this.outcomeTimer = 4.5;
    this.endReason = 'Left the building the quick way.';
    audio.setSqueegee(false, 0);
    audio.setWinch(false);
    audio.stopMusic();
    audio.play('stinger', { volume: 0.9 });
    this.cameras.main.zoomTo(1.06, 900);
  }

  private updateFalling(dt: number): void {
    this.outcomeTimer -= dt;
    this.washer.update(dt, this.sim, this.idleIntent(), {
      slippery: false,
      canClean: false,
      frozen: true,
    });
    this.sim.update(dt, [], 0, 0);
    this.rig.update(dt, 1);
    this.fx.update(dt);

    const cam = this.cameras.main;
    const target = Phaser.Math.Clamp(
      this.washer.fallY - VIEW.H * 0.34,
      ROOF_Y - 520,
      STREET_Y + 700 - VIEW.H,
    );
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, target, Math.min(1, dt * 7));
    this.tower.update(cam.scrollY, VIEW.H);

    audio.update(dt, { wind: 1, intensity: 0 });

    if (this.washer.fallY > STREET_Y - 40 || this.outcomeTimer <= 0) {
      this.mode = 'over';
      this.fx.shake(1, 400);
      audio.play('thud', { volume: 1, detune: -70 });
      audio.play('bodyHit', { volume: 1 });
      cam.fade(500, 0, 0, 0);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.finish(false, this.endReason));
    }
  }

  /* ------------------------------------------------------------------ misc */

  private desiredScrollY(): number {
    return this.sim ? this.sim.surfaceY - VIEW.H * 0.56 : deckY(0) - VIEW.H * 0.56;
  }

  private followCamera(dt: number): void {
    const cam = this.cameras.main;
    const target = this.desiredScrollY();
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, target, Math.min(1, dt * 5.5));
  }

  private musicIntensity(): number {
    const danger = Rig.danger(this.sim);
    const hurt = 1 - this.washer.health / RULES.maxHealth;
    const altitude = this.floor / Math.max(1, FLOOR_COUNT - 1);
    const finale = this.mode === 'finale' ? 0.45 : 0;
    return Phaser.Math.Clamp(danger * 0.5 + hurt * 0.25 + altitude * 0.3 + finale, 0, 1);
  }

  private toast(text: string, tone: ToastTone): void {
    this.events.emit('toast', { text, tone });
  }

  private emitHud(): void {
    const state: HudState = {
      score: this.score.value,
      multiplier: this.score.multiplier,
      health: this.washer.health,
      maxHealth: RULES.maxHealth,
      floor: this.floor,
      floorCount: FLOOR_COUNT,
      floorProgress: this.tower.floorProgress(this.floor),
      soap: this.soap,
      soapCapacity: RULES.soapCapacity,
      tilt: this.sim.angle,
      dumpAngle: SIM.dumpAngle,
      safetyCooldown: this.safetyCooldown,
      safetyCooldownMax: RULES.safetyLineCooldown,
      winchReady: this.winchReady,
      wind: this.hazards.wind,
      elapsed: this.elapsed,
    };
    this.events.emit('hud', state);
  }

  private finish(win: boolean, reason: string): void {
    if (this.mode === 'over' && this.scene.isActive('GameOverScene')) return;
    this.mode = 'over';

    audio.setSqueegee(false, 0);
    audio.setWinch(false);
    audio.stopMusic();

    const record = Save.recordRun(this.score.value, this.floorsCleared);
    const summary: RunSummary = {
      win,
      score: this.score.value,
      bestScore: record.bestScore,
      newBest: record.newBest,
      floorsCleared: this.floorsCleared,
      floorCount: FLOOR_COUNT,
      panesCleaned: this.score.panesCleaned,
      spotless: this.score.spotlessCount,
      bestMultiplier: this.score.bestMultiplier,
      timeSeconds: this.elapsed,
      reason,
    };

    this.scene.stop('UIScene');
    this.scene.start('GameOverScene', summary);
  }
}
