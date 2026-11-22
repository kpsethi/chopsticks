import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ArcadeApp } from '../src/arcade/app';
import { dailySeed } from '../src/arcade/game';
import { ArcadeStorage } from '../src/arcade/storage';
import { ArcadeControls, touchZone } from '../src/arcade/input';

describe('arcade input mapping', () => {
  test('maps only arrows and Space; opposing arrows cancel in the core', () => {
    const c = new ArcadeControls();
    expect(c.key('KeyW', true)).toBe(false);
    expect(c.key('ArrowLeft', true)).toBe(true);
    c.key('ArrowRight', true); c.key('Space', true);
    expect(c.input).toEqual({ left: true, right: true, burn: true });
    c.key('ArrowLeft', false); c.key('Space', false);
    expect(c.input).toEqual({ left: false, right: true, burn: false });
  });
  test('thirds have exact boundaries and clamp outside the surface', () => {
    expect([-1, 0, 129, 130, 259, 260, 390, 500].map(x => touchZone(x, 390)))
      .toEqual(['left', 'left', 'left', 'burn', 'burn', 'right', 'right', 'right']);
  });
  test('tracks independent fingers, moves between zones, and preserves keyboard holds', () => {
    const c = new ArcadeControls();
    const reused = c.input;
    c.pointer(1, 20, 390); c.pointer(2, 180, 390);
    expect(c.input).toEqual({ left: true, right: false, burn: true });
    c.pointer(1, 350, 390);
    c.key('Space', true); c.releasePointer(2);
    expect(c.input).toEqual({ left: false, right: true, burn: true });
    c.pointer(3, 360, 390); c.releasePointer(1);
    expect(c.input.right).toBe(true);
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
  LEVEL_NAMES: ['Clean drop'],
  ArcadeUI: class {
    root = Object.assign(new EventTarget(), { remove() {} });
    surface = Object.assign(new EventTarget(), { setPointerCapture() {} });
    constructor() { presentation.surface = this.surface; }
    setMuted(value: boolean) { presentation.muted = value; }
    show(screen: string) { presentation.screen = screen; presentation.shows++; }
    holds() {} reset() {} update() {} announce() {} gust() {} extraLife() {}
  },
}));

describe('arcade app input lifecycle', () => {
  let app: ArcadeApp;
  let clock = 1000;
  let scheduled: FrameRequestCallback | undefined;
  let saved: string | null;
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
  test('captured multi-touch drives slide plus burn and cancellation releases only its finger', () => {
    app.start();
    const pointer = (type: string, pointerId: number, clientX = 0) => presentation.surface!.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), { pointerId, clientX }));
    pointer('pointerdown', 1, 350); pointer('pointerdown', 2, 180); tick(0.2);
    expect(app.controls.input).toEqual({ left: false, right: true, burn: true });
    expect(app.game.booster.burning).toBe(true);
    pointer('pointermove', 1, 20); pointer('pointercancel', 2); tick(0.1);
    expect(app.controls.input).toEqual({ left: true, right: false, burn: false });
    pointer('lostpointercapture', 1);
    expect(app.controls.input.left).toBe(false);
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
  test('game over saves once, SPACE instantly retries, and M returns to the menu', () => {
    app.start(); tick(40);
    expect(app.game.state).toBe('gameOver'); expect(presentation.screen).toBe('gameOver');
    expect(new ArcadeStorage(window.localStorage).data.topScores).toHaveLength(1);
    tick(2); expect(new ArcadeStorage(window.localStorage).data.topScores).toHaveLength(1);
    key('Space'); expect(presentation.screen).toBe('playing'); expect(app.game.time).toBe(0);
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
