/**
 * Fully procedural audio. The project ships no audio assets, so every sound is
 * synthesised with WebAudio at runtime: squeegee squeaks, impacts, glass,
 * pigeons, wind, the winch motor, and an adaptive music bed whose tempo and
 * layering follow how much trouble the player is in.
 */

const STORAGE_KEY = 'pane-and-suffering:muted';

type SfxName =
  | 'click'
  | 'confirm'
  | 'thud'
  | 'bodyHit'
  | 'glassCrack'
  | 'glassBreak'
  | 'coo'
  | 'flap'
  | 'splat'
  | 'gust'
  | 'alarm'
  | 'chime'
  | 'ratchet'
  | 'sparkle'
  | 'stinger'
  | 'buzz';

interface MusicVoiceState {
  step: number;
  nextTime: number;
}

/** A minor -> F -> C -> G. Roots, pad voicings and arpeggio tones. */
const PROGRESSION = [
  { root: 110.0, pad: [220.0, 261.63, 329.63], arp: [440.0, 523.25, 659.25, 523.25] },
  { root: 87.31, pad: [174.61, 220.0, 261.63], arp: [523.25, 698.46, 880.0, 698.46] },
  { root: 130.81, pad: [196.0, 261.63, 329.63], arp: [659.25, 783.99, 1046.5, 783.99] },
  { root: 98.0, pad: [196.0, 246.94, 293.66], arp: [587.33, 783.99, 987.77, 783.99] },
] as const;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;

  private muted = false;
  private started = false;

  /** Continuous voices. */
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windTarget = 0;

  private squeegeeSource: AudioBufferSourceNode | null = null;
  private squeegeeFilter: BiquadFilterNode | null = null;
  private squeegeeGain: GainNode | null = null;

  private winchOsc: OscillatorNode | null = null;
  private winchGain: GainNode | null = null;
  private winchLfo: OscillatorNode | null = null;
  private windLfo: OscillatorNode | null = null;

  private musicOn = false;
  private musicIntensity = 0;
  private musicIntensityTarget = 0;
  private voice: MusicVoiceState = { step: 0, nextTime: 0 };

  constructor() {
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user-gesture handler before anything will sound. */
  unlock(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    this.started = true;

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.42;
    this.musicBus.connect(this.master);

    this.noise = this.buildNoise(ctx);
    this.startWind();
    void ctx.resume();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      /* storage unavailable — mute still applies for this session */
    }
    if (this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  /* ------------------------------------------------------------- lifecycle */

  /**
   * Scenes push their ambience parameters here rather than calling update(),
   * which is driven once per frame from the game loop. Smoothing that runs
   * twice in a frame converges at the wrong rate.
   */
  setParams(params: { wind?: number; intensity?: number }): void {
    if (params.wind !== undefined) this.windTarget = params.wind;
    if (params.intensity !== undefined) this.musicIntensityTarget = params.intensity;
  }

  /** Drive ambience and the music scheduler. Called once per frame. */
  update(dt: number, params: { wind?: number; intensity?: number } = {}): void {
    if (!this.ctx) return;

    this.setParams(params);

    this.musicIntensity += (this.musicIntensityTarget - this.musicIntensity) * Math.min(1, dt * 1.4);

    if (this.windGain && this.windFilter) {
      const t = this.ctx.currentTime;
      this.windGain.gain.setTargetAtTime(0.035 + this.windTarget * 0.19, t, 0.35);
      this.windFilter.frequency.setTargetAtTime(340 + this.windTarget * 720, t, 0.5);
    }

    if (this.musicOn) this.scheduleMusic();
  }

  startMusic(): void {
    if (!this.ctx) return;
    this.musicOn = true;
    this.voice.nextTime = Math.max(this.voice.nextTime, this.ctx.currentTime + 0.08);
  }

  stopMusic(): void {
    this.musicOn = false;
  }

  destroy(): void {
    this.stopMusic();
    this.setSqueegee(false, 0);
    this.setWinch(false);
    this.windSource?.stop();
    this.windLfo?.stop();
    this.windSource = null;
    this.windLfo = null;
    this.windFilter = null;
    this.windGain = null;
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }

  /* ------------------------------------------------------------------ sfx */

  play(name: SfxName, opts: { volume?: number; detune?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const vol = opts.volume ?? 1;
    const d = opts.detune ?? 0;

    switch (name) {
      case 'click':
        this.blip(t, 620 + d, 0.05, 0.12 * vol, 'square');
        break;
      case 'confirm':
        this.blip(t, 523.25, 0.09, 0.16 * vol, 'triangle');
        this.blip(t + 0.075, 783.99, 0.16, 0.15 * vol, 'triangle');
        break;
      case 'thud':
        this.boom(t, 118 + d, 0.34, 0.55 * vol);
        this.noiseBurst(t, 0.09, 380, 1.1, 0.28 * vol);
        break;
      case 'bodyHit':
        this.boom(t, 76, 0.26, 0.5 * vol);
        this.noiseBurst(t, 0.16, 900, 0.8, 0.33 * vol);
        this.blip(t, 180, 0.12, 0.14 * vol, 'sawtooth');
        break;
      case 'glassCrack':
        this.noiseBurst(t, 0.1, 4200, 3.4, 0.3 * vol);
        this.blip(t, 2400, 0.05, 0.08 * vol, 'square');
        break;
      case 'glassBreak':
        this.noiseBurst(t, 0.5, 3200, 1.6, 0.44 * vol);
        for (let i = 0; i < 9; i++) {
          this.blip(t + 0.02 + i * 0.035, 1600 + Math.random() * 3200, 0.11, 0.055 * vol, 'triangle');
        }
        this.boom(t, 96, 0.32, 0.3 * vol);
        break;
      case 'coo': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(520, t);
        o.frequency.exponentialRampToValueAtTime(370, t + 0.14);
        o.frequency.exponentialRampToValueAtTime(470, t + 0.3);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        o.connect(g).connect(this.sfxBus);
        o.start(t);
        o.stop(t + 0.45);
        break;
      }
      case 'flap':
        for (let i = 0; i < 3; i++) this.noiseBurst(t + i * 0.11, 0.07, 620, 1.5, 0.14 * vol);
        break;
      case 'splat':
        this.noiseBurst(t, 0.18, 700, 0.9, 0.3 * vol);
        this.blip(t, 150, 0.14, 0.12 * vol, 'sine');
        break;
      case 'gust':
        this.noiseBurst(t, 1.1, 700, 1.1, 0.3 * vol, 240);
        break;
      case 'alarm':
        this.blip(t, 880, 0.1, 0.13 * vol, 'square');
        this.blip(t + 0.14, 1174, 0.1, 0.13 * vol, 'square');
        break;
      case 'chime':
        this.blip(t, 1046.5, 0.4, 0.13 * vol, 'sine');
        this.blip(t + 0.06, 1567.98, 0.5, 0.09 * vol, 'sine');
        break;
      case 'ratchet':
        for (let i = 0; i < 5; i++) this.noiseBurst(t + i * 0.045, 0.03, 2600, 4, 0.1 * vol);
        break;
      case 'sparkle':
        for (let i = 0; i < 4; i++) this.blip(t + i * 0.05, 880 * Math.pow(1.26, i), 0.2, 0.075 * vol, 'sine');
        break;
      case 'stinger':
        this.blip(t, 196, 0.9, 0.18 * vol, 'sawtooth', 420);
        this.blip(t, 98, 1.1, 0.2 * vol, 'sawtooth', 300);
        break;
      case 'buzz':
        this.blip(t, 88, 0.3, 0.16 * vol, 'square', 500);
        break;
    }
  }

  /* --------------------------------------------------------- loop voices */

  setSqueegee(active: boolean, speed: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    if (active && !this.squeegeeSource) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 14;
      filter.frequency.value = 1400;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      this.squeegeeSource = src;
      this.squeegeeFilter = filter;
      this.squeegeeGain = gain;
    }

    if (this.squeegeeGain && this.squeegeeFilter) {
      const t = ctx.currentTime;
      this.squeegeeGain.gain.setTargetAtTime(active ? 0.075 + speed * 0.09 : 0.0001, t, 0.05);
      this.squeegeeFilter.frequency.setTargetAtTime(1100 + speed * 2400, t, 0.04);
    }

    if (!active && this.squeegeeSource) {
      const src = this.squeegeeSource;
      const gain = this.squeegeeGain;
      this.squeegeeSource = null;
      this.squeegeeFilter = null;
      this.squeegeeGain = null;
      gain?.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
      try {
        src.stop(ctx.currentTime + 0.25);
      } catch {
        /* already stopped */
      }
    }
  }

  setWinch(active: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;

    if (active && !this.winchOsc) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 62;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 11;
      lfoGain.gain.value = 5;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(filter).connect(gain).connect(this.sfxBus);
      osc.start();
      lfo.start();
      gain.gain.setTargetAtTime(0.11, ctx.currentTime, 0.12);
      this.winchOsc = osc;
      this.winchGain = gain;
      this.winchLfo = lfo;
    }

    if (!active && this.winchOsc) {
      const osc = this.winchOsc;
      const gain = this.winchGain;
      const lfo = this.winchLfo;
      this.winchOsc = null;
      this.winchGain = null;
      this.winchLfo = null;
      gain?.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
      try {
        osc.stop(ctx.currentTime + 0.4);
        lfo?.stop(ctx.currentTime + 0.4);
      } catch {
        /* already stopped */
      }
    }
  }

  /* --------------------------------------------------------------- music */

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const bpm = 84 + this.musicIntensity * 30;
    const stepDur = 60 / bpm / 2;
    const horizon = ctx.currentTime + 0.2;

    let guard = 0;
    while (this.voice.nextTime < horizon && guard++ < 16) {
      const at = Math.max(this.voice.nextTime, ctx.currentTime + 0.01);
      this.playStep(this.voice.step, at, stepDur);
      this.voice.step = (this.voice.step + 1) % 32;
      this.voice.nextTime = at + stepDur;
    }
  }

  private playStep(step: number, at: number, stepDur: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const bar = Math.floor(step / 8) % PROGRESSION.length;
    const beat = step % 8;
    const chord = PROGRESSION[bar];
    const heat = this.musicIntensity;

    if (beat === 0) {
      this.musicNote(chord.root, at, stepDur * 6, 0.15, 'sawtooth', 260);
      chord.pad.forEach((f, i) => this.musicNote(f, at, stepDur * 7.4, 0.032 + i * 0.004, 'triangle', 900));
    }
    if (beat === 4) this.musicNote(chord.root * 1.5, at, stepDur * 2.4, 0.075, 'sawtooth', 300);

    if (heat > 0.25 && (beat === 0 || beat === 3 || beat === 6)) {
      this.boom(at, 62, 0.2, 0.22 + heat * 0.2);
    }
    if (heat > 0.5 && beat % 2 === 1) {
      this.noiseBurst(at, 0.035, 6800, 2.4, 0.035 + heat * 0.03);
    }
    if (heat > 0.35) {
      const n = chord.arp[(step + bar) % chord.arp.length];
      this.musicNote(n, at, 0.28, 0.028 + heat * 0.03, 'sine');
    }
    if (heat > 0.75 && beat === 2) {
      this.musicNote(chord.arp[0] * 2, at, 0.5, 0.02, 'sine');
    }
  }

  private musicNote(
    freq: number,
    at: number,
    dur: number,
    peak: number,
    type: OscillatorType,
    cutoff?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.min(0.06, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    let tail: AudioNode = osc;
    if (cutoff !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      osc.connect(filter);
      tail = filter;
    }
    tail.connect(gain).connect(this.musicBus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  /* ------------------------------------------------------------ synthesis */

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = white * 0.62 + last * 3.2;
    }
    return buf;
  }

  private startWind(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0.03;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.12;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.windLfo = lfo;

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.windSource = src;
    this.windFilter = filter;
    this.windGain = gain;
  }

  private blip(
    at: number,
    freq: number,
    dur: number,
    peak: number,
    type: OscillatorType,
    cutoff?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    let tail: AudioNode = osc;
    if (cutoff !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff * 3, at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff), at + dur);
      osc.connect(filter);
      tail = filter;
    }
    tail.connect(gain).connect(this.sfxBus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private boom(at: number, freq: number, dur: number, peak: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.35), at + dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.6), at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noiseBurst(
    at: number,
    dur: number,
    freq: number,
    q: number,
    peak: number,
    sweepTo?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, at);
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), at + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.min(0.02, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(at);
    src.stop(at + dur + 0.05);
  }
}

/** One engine for the whole app; scenes share it through the registry. */
export const audio = new AudioEngine();
