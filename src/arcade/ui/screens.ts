import type { ArcadeGame } from '../game';
import type { ArcadeStorage } from '../storage';
import type { ArcadeCamera } from '../render/camera';
import { ARCADE as C } from '../constants';

export type Screen = 'title' | 'playing' | 'paused' | 'help' | 'gameOver';
export const LEVEL_NAMES = ['Clean drop', 'Crosswind', 'Drones', 'Gust front', 'Bird traffic', 'Moving arms', 'Balloons', 'Low cloud', 'Hot entry', 'Night shift'];
const number = (n: number) => n.toLocaleString('en-US');

export class ArcadeUI {
  readonly root = document.createElement('main');
  readonly surface: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly score: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly level: HTMLElement;
  private readonly lives: HTMLElement;
  private readonly best: HTMLElement;
  private readonly mode: HTMLElement;
  private readonly telemetry: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly fuel: HTMLElement;
  private readonly fuelNumber: HTMLElement;
  private readonly alignment: HTMLElement;
  private readonly popup: HTMLElement;
  private readonly popupTitle: HTMLElement;
  private readonly popupDetail: HTMLElement;
  private readonly wind: HTMLElement;
  private readonly mute: HTMLButtonElement;
  private readonly pause: HTMLButtonElement;
  private readonly zones: HTMLElement[];
  private screen: Screen = 'title';
  private lastScore = -1; private lastLives = -1; private lastLevel = -1; private lastMultiplier = -1;
  private lastSpeed = ''; private lastFuel = -1;
  private popupUntil = 0;
  private gustDirection = 1;
  private updateTime = -1;

  constructor() {
    this.root.id = 'arcade';
    this.root.innerHTML = `
      <div class="flight-surface" aria-label="Flight controls"></div>
      <header class="hud" hidden>
        <div class="score-block"><span>Score</span><strong id="score">0</strong></div>
        <div class="flight-stat"><span>Streak</span><strong id="multiplier">×1</strong></div>
        <div class="flight-stat"><span>Level</span><strong id="level">01</strong></div>
        <div class="flight-stat reserve"><span>Boosters</span><div id="lives"></div></div>
        <div class="flight-stat best"><span>Best</span><strong id="best">0</strong></div>
      </header>
      <div class="mode-tag" hidden></div>
      <div class="toolbar"><button data-action="mute" class="quiet" aria-label="Mute sound">Sound on</button><button data-action="pause" class="quiet" aria-label="Pause game" hidden>Ⅱ</button></div>
      <section class="panel"></section>
      <div class="telemetry" hidden><div class="fuel-track"><i></i></div><div class="flight-readout"><b class="speed"></b><span class="fuel-number"></span></div></div>
      <div class="alignment" hidden></div>
      <div class="popup" role="status" aria-live="polite" hidden><strong></strong><span></span></div>
      <div class="wind-alert" role="status" hidden></div>
      <div class="extra-life" role="status" hidden>+1 booster</div>
      <div class="touch-zones" hidden><div>←<small>Slide</small></div><div>↑<small>Hold to burn</small></div><div>→<small>Slide</small></div></div>
      <footer class="flight-footer" hidden><span>← → slide</span><span>Hold <kbd>SPACE</kbd> to burn</span><span><kbd>P</kbd> pause · <kbd>M</kbd> sound</span></footer>`;
    const get = <T extends HTMLElement = HTMLElement>(selector: string) => this.root.querySelector<T>(selector)!;
    this.surface = get('.flight-surface'); this.panel = get('.panel'); this.hud = get('.hud');
    this.score = get('#score'); this.multiplier = get('#multiplier'); this.level = get('#level');
    this.lives = get('#lives'); this.best = get('#best'); this.mode = get('.mode-tag');
    this.telemetry = get('.telemetry'); this.speed = get('.speed'); this.fuel = get('.fuel-track i');
    this.fuelNumber = get('.fuel-number'); this.alignment = get('.alignment');
    this.popup = get('.popup'); this.popupTitle = get('.popup strong'); this.popupDetail = get('.popup span');
    this.wind = get('.wind-alert'); this.mute = get('[data-action="mute"]'); this.pause = get('[data-action="pause"]');
    this.zones = Array.from(this.root.querySelectorAll('.touch-zones > div'));
    document.body.append(this.root);
  }
  setMuted(muted: boolean): void {
    this.mute.textContent = muted ? 'Sound off' : 'Sound on';
    this.mute.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    this.mute.setAttribute('aria-pressed', String(muted));
  }
  show(screen: Screen, storage: ArcadeStorage, date: string, game: ArcadeGame, longestStreak = 0, bestCatch = 0): void {
    this.screen = screen; this.root.dataset.screen = screen;
    const playing = screen === 'playing';
    this.hud.hidden = screen === 'title' || screen === 'help';
    this.mode.hidden = !playing; this.pause.hidden = !playing;
    this.panel.hidden = playing;
    this.telemetry.hidden = !playing; this.alignment.hidden = !playing;
    this.root.querySelector<HTMLElement>('.touch-zones')!.hidden = !playing;
    this.root.querySelector<HTMLElement>('.flight-footer')!.hidden = !playing;
    if (!playing) { this.popup.hidden = true; this.wind.hidden = true; }
    this.best.textContent = number(game.daily ? storage.dailyBest(date) : storage.data.bestScore);
    this.mode.textContent = game.daily ? `Daily · ${date} UTC` : 'Free flight';
    if (screen === 'title') {
      this.panel.innerHTML = `<div class="title-card"><p class="site-line"><i></i> Coastal launch control</p>
        <h1>CHOP<span>STICKS</span></h1><p class="tagline">Seventy metres of steel.<br>One soft landing.</p>
        <p class="instructions keyboard-instructions">← → slide · hold <kbd>SPACE</kbd> to burn</p>
        <p class="instructions touch-instructions">Hold left / right to slide · middle to burn</p>
        <div class="start-actions"><button class="primary" data-action="play">PLAY <span>↗</span></button>
        <button class="daily-button" data-action="daily"><strong>DAILY CHALLENGE</strong><small>${date} UTC · Best ${number(storage.dailyBest(date))}</small></button></div>
        <div class="title-bottom"><span>Personal best <b>${number(storage.data.bestScore)}</b></span><button class="text-button" data-action="help">How to catch</button></div>
        <p class="title-note">Three boosters. Make them count.</p></div>`;
    } else if (screen === 'paused') {
      this.panel.innerHTML = `<div class="modal-card"><p class="site-line">Flight on hold</p><h2>PAUSED</h2><p>Take a breath. The tower can wait.</p>
        <button class="primary" data-action="resume">RESUME <span>↗</span></button><button class="secondary" data-action="help">How to catch</button>
        <button class="text-button" data-action="menu">Back to menu</button><p class="hint">P / Esc to resume</p></div>`;
    } else if (screen === 'help') {
      this.panel.innerHTML = `<div class="modal-card help-card"><p class="site-line">The whole mission</p><h2>SOFT.<br>CENTERED.</h2>
        <p>Drop the booster’s pins onto the glowing arms. They close automatically.</p>
        <div class="help-controls"><b>← →</b><span>Slide sideways</span><b>SPACE</b><span>Hold to burn. Fuel is limited.</span></div>
        <p class="touch-help">Touch: hold the left, middle, or right third of the screen. Use two fingers to slide and burn.</p>
        <p><b>Catch:</b> within 1.5 m of centre, descending at 3 m/s or less.<br><b>Perfect:</b> within 0.4 m, at 1 m/s or less.</p>
        <p>Avoid the tower and traffic. Every three catches adds a new challenge.</p><button class="primary" data-action="back">GOT IT <span>↗</span></button></div>`;
    } else if (screen === 'gameOver') {
      this.panel.innerHTML = `<div class="modal-card results-card"><p class="site-line">${game.daily ? 'Daily challenge · ' + date : 'All boosters expended'}</p>
        <h2>SHIFT OVER.</h2><div class="final-score">${number(game.score)}<small>points</small></div>
        <dl class="results"><div><dt>${game.daily ? "Today’s best" : 'Personal best'}</dt><dd>${number(game.daily ? storage.dailyBest(date) : storage.data.bestScore)}</dd></div>
        <div><dt>Level reached</dt><dd>${String(game.level).padStart(2, '0')}</dd></div><div><dt>Longest streak</dt><dd>${longestStreak}</dd></div>
        <div><dt>Best catch</dt><dd>${number(bestCatch)} <small>pts</small></dd></div></dl>
        <button class="primary" data-action="retry">GO AGAIN <span>↗</span></button><button class="text-button" data-action="menu">Back to menu</button>
        <p class="hint">SPACE / tap to retry · M for menu</p></div>`;
    }
    if (!playing) this.panel.querySelector<HTMLButtonElement>('.primary')?.focus({ preventScroll: true });
  }
  announce(title: string, detail: string, time: number, duration = 1.2, kind = ''): void {
    this.popupTitle.textContent = title; this.popupDetail.textContent = detail;
    this.popup.dataset.kind = kind; this.popup.hidden = false; this.popupUntil = time + duration;
    this.popup.classList.remove('arrive'); void this.popup.offsetWidth; this.popup.classList.add('arrive');
  }
  gust(acceleration: number): void { this.gustDirection = Math.sign(acceleration); }
  extraLife(): void {
    const element = this.root.querySelector<HTMLElement>('.extra-life')!;
    element.hidden = false; window.setTimeout(() => { element.hidden = true; }, 1600);
  }
  holds(left: boolean, burn: boolean, right: boolean): void {
    this.zones[0].classList.toggle('held', left); this.zones[1].classList.toggle('held', burn); this.zones[2].classList.toggle('held', right);
  }
  reset(): void { this.updateTime = -1; this.lastScore = this.lastLives = this.lastLevel = this.lastMultiplier = -1; this.popup.hidden = true; }
  update(game: ArcadeGame, view: ArcadeCamera): void {
    if (this.screen !== 'playing') return;
    if (game.time >= this.popupUntil) this.popup.hidden = true;
    this.telemetry.hidden = game.state !== 'dropping'; this.alignment.hidden = game.state !== 'dropping';
    if (game.time - this.updateTime < 1 / 30 && game.time >= this.updateTime) return;
    this.updateTime = game.time;
    if (game.score !== this.lastScore) { this.score.textContent = number(game.score); this.lastScore = game.score; }
    if (game.multiplier !== this.lastMultiplier) { this.multiplier.textContent = `×${game.multiplier}`; this.lastMultiplier = game.multiplier; }
    if (game.level !== this.lastLevel) { this.level.textContent = String(game.level).padStart(2, '0'); this.lastLevel = game.level; }
    if (game.lives !== this.lastLives) {
      this.lives.innerHTML = '<i class="booster-icon"></i>'.repeat(game.lives);
      this.lives.setAttribute('aria-label', `${game.lives} boosters remaining`); this.lastLives = game.lives;
    }
    const b = game.booster, soft = -b.vy <= C.catchSpeed;
    const speed = `${Math.abs(b.vy).toFixed(1)} ${b.vy > 0 ? '↑' : '↓'}`;
    if (speed !== this.lastSpeed) { this.speed.textContent = speed; this.lastSpeed = speed; }
    this.speed.classList.toggle('soft', soft);
    const fuel = Math.round(b.fuel / b.fuelMax * 100);
    if (fuel !== this.lastFuel) {
      this.fuel.style.transform = `scaleY(${fuel / 100})`;
      this.fuel.classList.toggle('low', fuel < 20); this.fuelNumber.textContent = `${fuel}% fuel`; this.lastFuel = fuel;
    }
    let point = view.project(b.x + 10, b.y - 18);
    this.telemetry.style.transform = `translate(${Math.round(Math.max(8, Math.min(view.width - 100, point.x)))}px,${Math.round(Math.max(90, point.y))}px)`;
    point = view.project(game.arms.x, -7, 5);
    this.alignment.style.transform = `translate(${Math.round(point.x)}px,${Math.round(point.y)}px)`;
    const aligned = Math.abs(b.x - game.arms.x) <= C.catchOffset;
    this.alignment.classList.toggle('aligned', aligned);
    this.alignment.textContent = aligned ? 'ALIGNED' : `${Math.abs(b.x - game.arms.x).toFixed(1)} m ${b.x < game.arms.x ? '→' : '←'}`;
    this.wind.hidden = !game.wind.warning && !game.wind.gust;
    if (!this.wind.hidden) this.wind.textContent = `${this.gustDirection > 0 ? '→' : '←'} ${game.wind.warning ? 'GUST INCOMING' : 'CROSSWIND'} ${this.gustDirection > 0 ? '→' : '←'}`;
  }
}
