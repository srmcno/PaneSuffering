import Phaser from 'phaser';
import {
  FLOOR_COUNT,
  PANE,
  RIG,
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
  /** Latches the penthouse revocation toast so it fires once per fouling. */
  private penthouseFouled = false;
  /** Latches the notice that a dirty penthouse is holding the shift open. */
  private penthouseHeldOpen = false;
  private alarmTimer = 0;
  private outcomeTimer = 0;
  private endReason = '';
  /** Latched the moment a run ends, so no later frame can re-finish it. */
  private finished = false;
  /** Set on SHUTDOWN; a stale step must not touch destroyed systems. */
  private tornDown = false;
  private hudReady = false;
  private readonly pendingToasts: Array<{ text: string; tone: ToastTone }> = [];
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
    this.toast(`Floor 41. Four panes. ${this.prompt('clean')} to work the squeegee.`, 'info');
  }

  update(_time: number, deltaMs: number): void {
    // Clamp so a stalled tab cannot teleport the simulation.
    if (this.tornDown || !this.cameras?.main) return;
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    if (!this.hudReady) this.flushToasts();
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
      this.emitHud();
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

    audio.setParams({
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
    this.penthouseFouled = false;
    this.penthouseHeldOpen = false;
    this.alarmTimer = 0;
    this.outcomeTimer = 0;
    this.endReason = '';
    this.finished = false;
    this.tornDown = false;
    this.hudReady = false;
    this.pendingToasts.length = 0;
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
    this.tornDown = true;
    audio.setSqueegee(false, 0);
    audio.setWinch(false);
    // The audio engine is a shared singleton that outlives this scene: hand it
    // back idle rather than frozen at whatever the run ended on.
    audio.stopMusic();
    audio.setParams({ wind: 0, intensity: 0 });
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
    this.controls.reset();
    this.scene.pause();
    this.scene.launch('PauseScene');
  }

  private resumeFromPause(): void {
    this.controls.reset();
    this.scene.resume();
  }

  private restartRun(): void {
    // Deliberately not resuming first: scene.restart() queues a shutdown and
    // a start, and a resume racing those leaves this scene being stepped
    // after its cameras are gone.
    this.scene.stop('UIScene');
    this.scene.stop('PauseScene');
    this.scene.restart();
  }

  private quitToTitle(): void {
    audio.stopMusic();
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
          this.toast(`${this.prompt('safety')} snaps the safety line: levels the deck and buys you a second.`, 'good');
        }
        if (this.floor === FLOOR_COUNT - 1) {
          this.toast('Penthouse. Whatever is going on in there, finish the glass.', 'warn');
        }
      }
      return;
    }

    // Not while hanging off the rail: the grab QTE tells you to mash, and the
    // winch input is one of the things you can mash, so without this the
    // recovery prompt could send the rig up a floor with you still dangling.
    if (this.winchReady && intent.winchHeld && this.mode === 'work' && !this.washer.isDown) {
      this.beginAscent();
    }
  }

  private beginAscent(): void {
    const points = this.score.finishFloor(this.elapsed - this.floorStart);
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
    const nearBucket = Math.abs(this.washer.localX - RIG.bucketOffset) < 110;
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
        this.toast(`Walk with ${this.prompt('walk')} to sweep the blade across the glass.`, 'info');
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
    // The penthouse keeps being scored during the set-piece, so 'finale' has
    // to be watched too: pigeons still spawn while the building comes apart.
    if (this.mode !== 'work' && this.mode !== 'finale') return;
    const progress = this.tower.floorProgress(this.floor);

    if (this.floor >= FLOOR_COUNT - 1) {
      const signedOff = progress >= RULES.floorTarget;
      if (signedOff && !this.hazards.finaleActive && !this.hazards.finaleComplete) {
        this.mode = 'finale';
        this.hazards.startFinale(this.hazardContext());
      }
      if (signedOff) {
        this.penthouseFouled = false;
        this.penthouseHeldOpen = false;
      } else if (this.mode === 'finale') {
        // Same rule as every other floor: you do not clock off on a floor
        // that is no longer signed off, however loud the finale is. Say it
        // twice, because the two moments are not the same moment — a pigeon
        // fouling the glass mid-storm is a warning, and the set-piece ending
        // with the glass still dirty is the thing actually holding the shift
        // open, up to nine seconds later.
        if (this.hazards.finaleComplete) {
          if (!this.penthouseHeldOpen) {
            this.penthouseHeldOpen = true;
            audio.play('buzz', { volume: 0.5 });
            this.fx.banner('FINISH THE GLASS', '#f6b73c', 'the penthouse is below standard');
            this.toast('The dust has settled — the penthouse is still below standard.', 'warn');
          }
        } else if (!this.penthouseFouled) {
          this.penthouseFouled = true;
          audio.play('buzz', { volume: 0.5 });
          this.toast('Sign-off revoked — finish the glass before you clock off.', 'warn');
        }
      }
      return;
    }

    if (progress >= RULES.floorTarget && !this.winchReady) {
      this.winchReady = true;
      audio.play('confirm', { volume: 0.8 });
      this.fx.banner('FLOOR CLEAR', '#5ce8a0', `${this.prompt('winch')} to winch up`);
      this.toast(`Floor signed off. ${this.prompt('winch')} to winch up to the next one.`, 'good');
    } else if (progress < RULES.floorTarget && this.winchReady) {
      // A pigeon fouling a finished pane has to actually cost something, or
      // the hazard is toothless exactly when it is most likely to fire.
      this.winchReady = false;
      audio.play('buzz', { volume: 0.5 });
      this.toast('Sign-off revoked — that pane needs doing again.', 'warn');
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
      this.toast(`The deck tips under your weight. ${this.prompt('crouch')} to crouch and brace.`, 'warn');
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
        touch: this.controls.touchActive,
      });
    } else {
      this.clearGrab();
    }

    if (
      this.mode === 'finale' &&
      this.hazards.finaleComplete &&
      this.washer.health > 0 &&
      this.washer.state !== 'fall' &&
      this.tower.floorProgress(this.floor) >= RULES.floorTarget
    ) {
      this.floorsCleared = FLOOR_COUNT;
      this.score.bonus(1500);
      this.finish(true, 'Penthouse survived. Shift complete.');
    }
  }

  /**
   * The hang overlay is emitted from updateFeedback, which the terminal modes
   * never reach — so every path out of gameplay has to dismiss it explicitly.
   */
  private clearGrab(): void {
    this.events.emit('grab', { active: false, progress: 0, timeLeft: 0, touch: this.controls.touchActive });
  }

  private checkFailure(): void {
    // Hazards resolve before the finale's win check, so a hit can zero health
    // on the very frame the run is won. The completed run wins that race.
    if (this.finished || this.mode === 'over') return;
    if (this.washer.state === 'fall' && this.mode !== 'falling') {
      this.beginFallSequence();
      return;
    }
    if (this.washer.health <= 0 && this.mode !== 'dying') {
      this.mode = 'dying';
      this.clearGrab();
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
    this.clearGrab();
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
    this.emitHud();

    audio.setParams({ wind: 1, intensity: 0 });

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

  /**
   * `scene.launch` is queued, so the HUD is not listening yet while create()
   * runs. Buffer anything emitted before the first update or the onboarding
   * message is silently dropped on every run.
   */
  /**
   * Names whichever control the player actually has. Naming a key on a touch
   * device is not a cosmetic problem: the winch prompt is the progression
   * gate and the crouch prompt is the answer to being tipped off the rig.
   */
  private prompt(action: 'clean' | 'walk' | 'crouch' | 'safety' | 'winch'): string {
    const touch = this.controls.touchActive;
    switch (action) {
      case 'clean':
        return touch ? 'HOLD CLEAN' : 'HOLD SPACE';
      case 'walk':
        return touch ? 'the ◀ / ▶ pads' : 'A / D';
      case 'crouch':
        return touch ? 'HOLD CROUCH' : 'HOLD S';
      case 'safety':
        return touch ? 'The SAFETY pad' : 'SHIFT';
      case 'winch':
        return touch ? 'HOLD ASCEND' : 'HOLD W';
    }
  }

  private toast(text: string, tone: ToastTone): void {
    if (!this.hudReady) {
      this.pendingToasts.push({ text, tone });
      return;
    }
    this.events.emit('toast', { text, tone });
  }

  private flushToasts(): void {
    this.hudReady = true;
    for (const t of this.pendingToasts) this.events.emit('toast', t);
    this.pendingToasts.length = 0;
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
      touch: this.controls.touchActive,
    };
    this.events.emit('hud', state);
  }

  private finish(win: boolean, reason: string): void {
    if (this.finished) return;
    this.finished = true;
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
