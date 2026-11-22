import { ArcadeGame, dailySeed, type ArcadeEvent } from './game';
import { ARCADE as C } from './constants';
import { ArcadeControls } from './input';
import { ArcadeStorage } from './storage';
import { ArcadeAudio } from './audio';
import { ArcadeRenderer } from './render/scene';
import { ArcadeUI, type Screen } from './ui/screens';

const crashMessage = (e: Extract<ArcadeEvent, { type: 'crash' }>) => {
  if (e.reason === 'arms' || e.reason === 'speed') {
    const faults = [];
    if (e.speed > C.catchSpeed) faults.push(`Too fast: ${e.speed.toFixed(1)} m/s (max ${C.catchSpeed})`);
    if (e.offset > e.maxOffset) faults.push(`${faults.length ? 'and off centre' : 'Off centre:'} ${e.offset.toFixed(1)} m (max ${e.maxOffset})`);
    const tip = e.speed > C.catchSpeed ? 'Start burning at the red line.' : 'Stay between the brackets.';
    return `${faults.join(' ')}. ${tip}`;
  }
  return e.reason === 'tower' ? 'Clipped the tower. Slide toward the brackets.'
    : e.reason === 'ground' ? 'Missed the arms. Aim for the brackets.' : 'Traffic collision. Find a gap in the lane.';
};
function randomSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]; }
const today = () => new Date().toISOString().slice(0, 10);

export class ArcadeApp {
  game = new ArcadeGame({ seed: 1 });
  readonly controls = new ArcadeControls();
  private readonly storage = new ArcadeStorage();
  private readonly audio = new ArcadeAudio(this.storage.data.muted);
  private readonly ui = new ArcadeUI();
  private readonly renderer: ArcadeRenderer;
  private screen: Screen = 'title';
  private helpReturn: 'title' | 'paused' = 'title';
  private runDate = today();
  private longestStreak = 0;
  private bestCatch = 0;
  private losses: string[] = [];
  private announcedLevel = 0;
  private saved = false;
  private lastTime = 0;
  private frameId = 0;
  private disposed = false;

  constructor() {
    this.renderer = new ArcadeRenderer(this.ui.root);
    this.ui.setMuted(this.storage.data.muted);
    this.show('title');
    // The title is a posed real scene. It never advances gameplay or consumes a daily seed.
    this.game.booster.x = 24; this.game.booster.y = 140;
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.blur);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibility);
    this.ui.root.addEventListener('click', this.click);
    this.ui.surface.addEventListener('pointerdown', this.pointerdown);
    this.ui.surface.addEventListener('pointermove', this.pointermove);
    this.ui.surface.addEventListener('pointerup', this.pointerup);
    this.ui.surface.addEventListener('pointercancel', this.pointerup);
    this.ui.surface.addEventListener('lostpointercapture', this.pointerup);
    this.frameId = requestAnimationFrame(this.frame);
  }
  start(daily = false): void {
    this.audio.unlock(); this.audio.silence(); this.audio.resume(); this.controls.clear();
    this.runDate = today();
    this.game = new ArcadeGame({ seed: daily ? dailySeed(new Date(this.runDate)) : randomSeed(), daily });
    this.longestStreak = this.bestCatch = 0; this.saved = false; this.losses = []; this.announcedLevel = 0;
    this.ui.reset(); this.show('playing');
    for (const event of this.game.step(0, this.controls.input)) this.event(event);
    this.lastTime = performance.now();
  }
  private show(screen: Screen): void {
    this.screen = screen; this.controls.clear(); this.ui.holds(false, false, false);
    if (screen !== 'playing') this.audio.silence(); else this.audio.resume();
    this.ui.show(screen, this.storage, screen === 'title' ? today() : this.runDate, this.game, this.longestStreak, this.bestCatch, this.losses);
    if (screen === 'playing') (document.activeElement as HTMLElement | null)?.blur();
  }
  private menu(): void {
    this.saveRun(); this.game = new ArcadeGame({ seed: 1 });
    for (const event of this.game.step(0, this.controls.input)) this.renderer.event(event);
    this.game.booster.x = 24; this.game.booster.y = 140; this.show('title');
  }
  private saveRun(): void {
    if (this.saved || (this.screen !== 'playing' && this.screen !== 'paused' && this.screen !== 'gameOver' && this.helpReturn !== 'paused')) return;
    this.storage.record({ score: this.game.score, level: this.game.level, longestStreak: this.longestStreak,
      bestCatch: this.bestCatch, daily: this.game.daily, date: this.runDate });
    this.saved = true;
  }
  private togglePause(): void {
    if (this.screen === 'playing') this.show('paused');
    else if (this.screen === 'paused') { this.show('playing'); this.lastTime = performance.now(); }
  }
  private readonly keydown = (event: KeyboardEvent): void => {
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (this.screen === 'playing' && this.controls.key(event.code, true)) return;
    if (event.repeat) return;
    this.audio.unlock();
    if (event.code === 'KeyM') {
      if (this.screen === 'gameOver') this.menu(); else this.toggleMute();
    } else if (event.code === 'Escape' || event.code === 'KeyP') {
      if (this.screen === 'help') this.show(this.helpReturn); else this.togglePause();
    } else if (event.code === 'Space') {
      if (this.screen === 'title') this.start();
      else if (this.screen === 'gameOver') this.start(this.game.daily);
      else if (this.screen === 'paused') this.togglePause();
    }
  };
  private readonly keyup = (event: KeyboardEvent): void => { if (this.controls.key(event.code, false)) event.preventDefault(); };
  private toggleMute(): void {
    const muted = !this.storage.data.muted;
    this.storage.setMuted(muted); this.audio.setMuted(muted); this.ui.setMuted(muted);
  }
  private readonly click = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button) {
      if (this.screen === 'gameOver') this.start(this.game.daily);
      return;
    }
    this.audio.unlock();
    switch (button.dataset.action) {
      case 'play': this.start(); break;
      case 'daily': this.start(true); break;
      case 'retry': this.start(this.game.daily); break;
      case 'pause': case 'resume': this.togglePause(); break;
      case 'mute': this.toggleMute(); break;
      case 'menu': this.menu(); break;
      case 'help': this.helpReturn = this.screen === 'paused' ? 'paused' : 'title'; this.show('help'); break;
      case 'back': this.show(this.helpReturn); break;
    }
  };
  private readonly pointerdown = (event: PointerEvent): void => {
    if (this.screen !== 'playing') return;
    event.preventDefault(); this.audio.unlock();
    this.ui.surface.setPointerCapture(event.pointerId);
    this.controls.pointer(event.pointerId, event.clientX, window.innerWidth);
  };
  private readonly pointermove = (event: PointerEvent): void => {
    if (this.controls.hasPointer(event.pointerId)) {
      event.preventDefault(); this.controls.pointer(event.pointerId, event.clientX, window.innerWidth);
    }
  };
  private readonly pointerup = (event: PointerEvent): void => { this.controls.releasePointer(event.pointerId); };
  private readonly blur = (): void => {
    this.controls.clear(); if (this.screen === 'playing') this.show('paused');
  };
  private readonly visibility = (): void => { if (document.hidden) this.blur(); this.lastTime = performance.now(); };
  private readonly resize = (): void => { this.renderer.resize(); };
  private event(event: ArcadeEvent): void {
    this.renderer.event(event); this.audio.event(event);
    switch (event.type) {
      case 'spawn':
        this.ui.clearPopup(); // the crash card never covers a fresh drop
        // Only announce new levels so the last crash reason is not covered up.
        if (event.level !== this.announcedLevel) {
          this.announcedLevel = event.level;
          const twists = this.game.conditions.twists.map(t => t.name);
          this.ui.announce(`LEVEL ${event.level}`, twists.length ? twists.join(' · ') : 'Clean drop', event.time, 1.2);
        }
        this.ui.conditions(this.game);
        break;
      case 'catch':
        this.longestStreak = Math.max(this.longestStreak, this.game.streak);
        this.bestCatch = Math.max(this.bestCatch, event.points);
        this.ui.announce(event.perfect ? 'PERFECT!' : 'CAUGHT!', `+${event.points}  ·  STREAK ×${this.game.multiplier}`, event.time, 1.2, 'catch');
        break;
      case 'crash':
        this.ui.announce('BOOSTER LOST', crashMessage(event), event.time, C.explodeTime, 'crash');
        this.losses.push(crashMessage(event)); break;
      case 'extraLife': this.ui.extraLife(); break;
      case 'gustWarning': case 'gust': this.ui.gust(event.acceleration); break;
      case 'fuelOut': this.ui.announce('FUEL EMPTY', 'Make the glide count.', event.time, 0.9); break;
      case 'gameOver': this.saveRun(); this.show('gameOver'); break;
    }
  }
  private readonly frame = (now: number): void => {
    if (this.disposed) return;
    const dt = this.lastTime ? Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000)) : 0;
    this.lastTime = now;
    if (this.screen === 'playing') {
      const events = this.game.step(dt, this.controls.input);
      for (let i = 0; i < events.length; i++) this.event(events[i]);
      this.audio.update(this.game);
      this.ui.holds(this.controls.input.left, this.controls.input.burn, this.controls.input.right);
    }
    const preview = this.screen === 'title' || (this.screen === 'help' && this.helpReturn === 'title');
    this.renderer.render(this.game, this.screen === 'playing' || preview ? dt : 0, preview);
    this.ui.update(this.game, this.renderer.view);
    this.frameId = requestAnimationFrame(this.frame);
  };
  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.frameId);
    window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.blur); window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.visibility);
    this.ui.root.removeEventListener('click', this.click);
    this.ui.surface.removeEventListener('pointerdown', this.pointerdown); this.ui.surface.removeEventListener('pointermove', this.pointermove);
    this.ui.surface.removeEventListener('pointerup', this.pointerup); this.ui.surface.removeEventListener('pointercancel', this.pointerup);
    this.ui.surface.removeEventListener('lostpointercapture', this.pointerup);
    this.controls.clear(); this.audio.dispose(); this.renderer.dispose(); this.ui.root.remove();
  }
}
