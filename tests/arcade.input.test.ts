import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ArcadeApp } from '../src/arcade/app';
import { dailySeed } from '../src/arcade/game';
import { ArcadeStorage } from '../src/arcade/storage';
import { ArcadeControls, STICK } from '../src/arcade/input';

describe('arcade input mapping', () => {
  test('maps one-handed arrows, WASD and Space; aliases and opposing keys stay independent', () => {
    const c = new ArcadeControls();
    expect(c.key('KeyX', true)).toBe(false);
    expect(c.key('ArrowLeft', true)).toBe(true);
    c.key('ArrowRight', true); c.key('Space', true); c.key('ArrowUp', true);
    expect(c.input).toEqual({ left: true, right: true, burn: true });
    c.key('ArrowLeft', false); c.key('Space', false);
    expect(c.input).toEqual({ left: false, right: true, burn: true });
    c.key('ArrowUp', false);
    expect(c.input).toEqual({ left: false, right: true, burn: false });
    c.key('KeyA', true); c.key('KeyW', true); c.key('ArrowRight', false);
    expect(c.input).toEqual({ left: true, right: false, burn: true });
    c.key('KeyD', true); c.key('KeyA', false); c.key('KeyW', false);
    expect(c.input).toEqual({ left: false, right: true, burn: false });
  });
  test('drag-anywhere floating thumbstick steers left/right proportionally and burns when pushed up', () => {
    const c = new ArcadeControls();
    c.pointerDown(1, 200, 500);
    expect(c.input).toEqual({ left: false, right: false, burn: false, steer: 0 });
    // Drag straight up -> burns without sideways drift.
    c.pointerMove(1, 205, 500 - STICK.burnUp - 8);
    expect(c.input).toEqual({ left: false, right: false, burn: true, steer: 0 });
    // Drag right without going up -> glides right proportionally (no fuel spent).
    c.pointerMove(1, 230, 500);
    expect(c.input.burn).toBe(false);
    expect(c.input.right).toBe(true);
    expect(c.input.steer).toBeCloseTo((30 - STICK.deadzoneX) / (STICK.fullX - STICK.deadzoneX), 5);
    // Diagonal up-left -> burns and steers left simultaneously.
    c.pointerMove(1, 160, 470);
    expect(c.input.left).toBe(true);
    expect(c.input.burn).toBe(true);
    expect(c.input.steer).toBeLessThan(0);
    c.releasePointer(1);
    expect(c.input).toEqual({ left: false, right: false, burn: false });
  });
  test('elastic follow-leash pulls the anchor behind long drags so reversing and cutting burn feel instant', () => {
    const c = new ArcadeControls();
    const reused = c.input;
    c.pointerDown(1, 200, 500);
    // Drag far upward (160px); anchor should follow within maxRadius.
    c.pointerMove(1, 200, 340);
    expect(c.input.burn).toBe(true);
    expect(c.activeStick()!.anchorY).toBeCloseTo(340 + STICK.maxRadius, 5);
    // Slight downward nudge cuts burn immediately without dragging all the way back to 500.
    c.pointerMove(1, 200, 385);
    expect(c.input.burn).toBe(false);
    // Keyboard holds combine cleanly and clear() reuses the input object.
    c.key('Space', true);
    expect(c.input.burn).toBe(true);
    c.clear();
    expect(c.input).toBe(reused);
    expect(c.input).toEqual({ left: false, right: false, burn: false });
  });
});

// Exercise the real app, inputs, core and persistence; only presentation is replaced.
const presentation = vi.hoisted(() => ({ screen: '', shows: 0, muted: false, surface: null as EventTarget | null }));
vi.mock('../src/arcade/render/scene', () => ({ ArcadeRenderer: class {
  view = {}; resize() {} event() {} render() {} dispose() {}
} }));
vi.mock('../src/arcade/audio', () => ({ ArcadeAudio: class {
  unlock() {} silence() {} resume() {} update() {} event() {} dispose() {}
  setMuted(value: boolean) { presentation.muted = value; }
} }));
vi.mock('../src/arcade/ui/screens', () => ({
  ArcadeUI: class {
    root = Object.assign(new EventTarget(), { remove() {} });
    surface = Object.assign(new EventTarget(), { setPointerCapture() {} });
    constructor() { presentation.surface = this.surface; }
    setMuted(value: boolean) { presentation.muted = value; }
    show(screen: string) { presentation.screen = screen; presentation.shows++; }
    stick() {} reset() {} update() {} announce() {} gust() {} extraLife() {} clearPopup() {} conditions() {}
  },
}));

describe('arcade app input lifecycle', () => {
  let app: ArcadeApp;
  let clock = 1000;
  let scheduled: FrameRequestCallback | undefined;
  let saved: string | null;
  let vibrate: ReturnType<typeof vi.fn>;
  function key(code: string, type = 'keydown', repeat = false) {
    const e = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
    window.dispatchEvent(e); return e;
  }
  function tick(seconds: number) {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      clock += 1000 / 60; const next = scheduled; scheduled = undefined; next?.(clock);
    }
  }
  beforeEach(() => {
    clock = 1000; saved = null; presentation.screen = ''; presentation.shows = 0;
    vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 390, innerHeight: 844,
      localStorage: { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } } }));
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, activeElement: null }));
    vi.stubGlobal('performance', { now: () => clock });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { scheduled = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { scheduled = undefined; });
    app = new ArcadeApp();
  });
  afterEach(() => { app.dispose(); vi.unstubAllGlobals(); });
  test('boots only the title and SPACE starts; arrows and burn reach the real core', () => {
    expect(presentation.screen).toBe('title'); tick(1); expect(app.game.time).toBe(0);
    expect(key('Space').defaultPrevented).toBe(true); expect(presentation.screen).toBe('playing');
    const x = app.game.booster.x;
    key('ArrowRight'); key('Space'); tick(0.5);
    expect(app.game.booster.x).toBeGreaterThan(x);
    expect(app.game.booster.burning).toBe(true);
    expect(app.game.booster.fuel).toBeLessThan(7);
    key('Space', 'keyup'); key('ArrowRight', 'keyup'); tick(0.1);
    expect(app.game.booster.burning).toBe(false);
  });
  test('drag-anywhere floating stick drives slide+burn with haptics and cancellation releases only its finger', () => {
    app.start();
    const pointer = (type: string, pointerId: number, clientX = 0, clientY = 500) => presentation.surface!.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), { pointerId, clientX, clientY }));
    // Touch anywhere, drag right to glide, then push up-right to burn+steer.
    pointer('pointerdown', 1, 200, 500);
    pointer('pointermove', 1, 250, 500); tick(0.1);
    expect(app.controls.input).toEqual({ left: false, right: true, burn: false, steer: 1 });
    expect(vibrate).toHaveBeenCalledWith(6);
    pointer('pointermove', 1, 240, 465); tick(0.2);
    expect(app.controls.input.right).toBe(true);
    expect(app.controls.input.burn).toBe(true);
    expect(app.game.booster.burning).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(10);
    pointer('pointercancel', 1); tick(0.1);
    expect(app.controls.input).toEqual({ left: false, right: false, burn: false });
    expect(app.controls.activeStick()).toBeNull();
  });
  test('P, Esc, blur and visibility pause without spending fuel or retaining held inputs', () => {
    app.start(); key('ArrowLeft'); key('Space'); tick(0.2); key('KeyP');
    expect(presentation.screen).toBe('paused'); const time = app.game.time, fuel = app.game.booster.fuel;
    expect(app.controls.input).toEqual({ left: false, right: false, burn: false });
    tick(2); expect(app.game.time).toBe(time); expect(app.game.booster.fuel).toBe(fuel);
    key('Escape'); tick(0.1); expect(app.game.time).toBeGreaterThan(time);
    window.dispatchEvent(new Event('blur')); expect(presentation.screen).toBe('paused');
    key('KeyP'); Object.assign(document, { hidden: true }); document.dispatchEvent(new Event('visibilitychange'));
    expect(presentation.screen).toBe('paused');
  });
  test('game over saves once, guards accidental immediate retry, then retries via SPACE/ArrowUp and M returns to menu', () => {
    app.start();
    for (let i = 0; i < 40 * 60 && presentation.screen !== 'gameOver'; i++) tick(1 / 60);
    expect(app.game.state).toBe('gameOver'); expect(presentation.screen).toBe('gameOver');
    expect(new ArcadeStorage(window.localStorage).data.topScores).toHaveLength(1);
    // Immediate key press right on gameOver is ignored during the accidental-tap guard.
    key('Space'); expect(presentation.screen).toBe('gameOver');
    tick(0.5); expect(new ArcadeStorage(window.localStorage).data.topScores).toHaveLength(1);
    key('ArrowUp'); expect(presentation.screen).toBe('playing'); expect(app.game.time).toBe(0);
    expect(app.game.lives).toBe(3); tick(40); key('KeyM'); expect(presentation.screen).toBe('title');
    expect(new ArcadeStorage(window.localStorage).data.topScores).toHaveLength(2);
  });
  test('daily uses today’s UTC seed and retry preserves today’s opening layout', () => {
    app.start(true); const x = app.game.booster.x;
    const reference = new (app.game.constructor as typeof import('../src/arcade/game').ArcadeGame)({ seed: dailySeed(new Date()), daily: true });
    expect(app.game.daily).toBe(true); expect(x).toBe(reference.booster.x);
    tick(40); expect(presentation.screen).toBe('gameOver');
    expect(new ArcadeStorage(window.localStorage).data.topScores).toHaveLength(0);
    key('Space'); expect(app.game.daily).toBe(true); expect(app.game.booster.x).toBe(x);
  });
  test('M mutes once per press and persists; disposal removes listeners', () => {
    key('KeyM'); expect(presentation.muted).toBe(true);
    key('KeyM', 'keydown', true); expect(presentation.muted).toBe(true);
    expect(new ArcadeStorage(window.localStorage).data.muted).toBe(true);
    app.dispose(); key('Space'); expect(presentation.screen).toBe('title');
  });
});
