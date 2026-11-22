import type { ArcadeEvent, ArcadeGame } from './game';

/** Gesture-unlocked synth adapted from the original engine; no audio assets. */
export class ArcadeAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private activity?: GainNode;
  private rumble?: GainNode;
  private bass?: GainNode;
  private noise?: AudioBuffer;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private readonly shots = new Set<AudioScheduledSourceNode>();
  private power = false;
  private lastBeep = -10;
  private unavailable = false;
  constructor(private muted: boolean) {}
  unlock(): void {
    if (this.unavailable) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        const ctx = this.context;
        this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.45;
        const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -10; limiter.ratio.value = 8;
        this.master.connect(limiter); limiter.connect(ctx.destination);
        this.activity = ctx.createGain(); this.activity.connect(this.master);
        this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = this.noise.getChannelData(0); let low = 0;
        for (let i = 0; i < data.length; i++) { low = (low + (Math.random() * 2 - 1) * 0.035) / 1.035; data[i] = low * 4; }
        const source = ctx.createBufferSource(); source.buffer = this.noise; source.loop = true;
        this.rumble = ctx.createGain(); this.rumble.gain.value = 0; source.connect(this.rumble); this.rumble.connect(this.activity);
        const osc = ctx.createOscillator(); osc.frequency.value = 44;
        this.bass = ctx.createGain(); this.bass.gain.value = 0; osc.connect(this.bass); this.bass.connect(this.activity);
        source.start(); osc.start(); this.sources.add(source); this.sources.add(osc);
      }
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
    } catch { this.unavailable = true; }
  }
  setMuted(value: boolean): void {
    this.muted = value;
    if (this.context && this.master) this.master.gain.setTargetAtTime(value ? 0 : 0.45, this.context.currentTime, 0.02);
  }
  update(game: ArcadeGame): void {
    if (!this.context || !this.activity) return;
    const burning = game.booster.burning;
    if (burning !== this.power) {
      this.power = burning;
      this.rumble!.gain.setTargetAtTime(burning ? 0.6 : 0, this.context.currentTime, 0.04);
      this.bass!.gain.setTargetAtTime(burning ? 0.16 : 0, this.context.currentTime, 0.04);
    }
    if (game.time - this.lastBeep < 0.65 || game.state !== 'dropping') return;
    for (const h of game.hazards) {
      if (Math.abs(h.x - game.booster.x) < 24 && h.y < game.booster.y + 15 && h.y > game.booster.y - 90) {
        this.tone(740, 0.08, 0.1); this.lastBeep = game.time; break;
      }
    }
  }
  event(event: ArcadeEvent): void {
    if (!this.context || this.muted) return;
    switch (event.type) {
      case 'catch': {
        // The chord climbs a whole tone per streak step, so a run sounds like it is building.
        const up = Math.pow(2, Math.min(event.streak - 1, 8) * 2 / 12);
        this.tone(1300, 0.14, 0.13, 0, 410, 'square');
        this.tone(261.63 * up, 0.65, 0.12, 0.08); this.tone(329.63 * up, 0.65, 0.1, 0.16); this.tone(392 * up, 0.65, 0.1, 0.24);
        if (event.streak >= 3) this.tone(523.25 * up, 0.8, 0.09, 0.32);
        break;
      }
      case 'perfect':
        for (let i = 0; i < 5; i++) this.tone(1046.5 * Math.pow(2, i / 6), 0.24, 0.07, i * 0.075); break;
      case 'crash': this.burst(1.3, 0.9); this.tone(70, 0.8, 0.45, 0, 20); break;
      case 'gust': this.burst(0.7, 0.2); break;
      case 'gustWarning': this.tone(420, 0.14, 0.09); this.tone(560, 0.14, 0.09, 0.2); break;
      case 'levelUp':
        this.tone(392, 0.25, 0.1, 0.35); this.tone(523.25, 0.25, 0.1, 0.5); this.tone(783.99, 0.4, 0.1, 0.65); break;
      case 'extraLife': this.tone(660, 0.25, 0.12); this.tone(1320, 0.5, 0.12, 0.2); break;
      case 'fuelOut': this.tone(220, 0.2, 0.1, 0, 110); break;
      case 'spawn': this.lastBeep = -10; break;
    }
  }
  private tone(hz: number, duration: number, level: number, delay = 0, end = hz, type: OscillatorType = 'sine'): void {
    if (!this.context || this.muted) return;
    const source = this.context.createOscillator(), start = this.context.currentTime + delay;
    source.type = type; source.frequency.setValueAtTime(hz, start); source.frequency.exponentialRampToValueAtTime(end, start + duration);
    this.shot(source, start, duration, level);
  }
  private burst(duration: number, level: number): void {
    if (!this.context || this.muted) return;
    const source = this.context.createBufferSource(); source.buffer = this.noise!; source.loop = true;
    this.shot(source, this.context.currentTime, duration, level);
  }
  private shot(source: AudioScheduledSourceNode, start: number, duration: number, level: number): void {
    const gain = this.context!.createGain(); gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain); gain.connect(this.activity!); this.shots.add(source);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.shots.delete(source); };
    source.start(start); source.stop(start + duration + 0.02);
  }
  resume(): void {
    if (this.context && this.activity) this.activity.gain.setTargetAtTime(1, this.context.currentTime, 0.02);
  }
  silence(): void {
    this.power = false;
    if (this.context) {
      this.rumble?.gain.setValueAtTime(0, this.context.currentTime);
      this.bass?.gain.setValueAtTime(0, this.context.currentTime);
      this.activity?.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
    }
    for (const source of this.shots) { try { source.stop(); } catch { /* Already ended. */ } }
    this.shots.clear();
  }
  dispose(): void {
    this.silence();
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear(); if (this.context) void this.context.close().catch(() => {});
  }
}
