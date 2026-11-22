import { describe, expect, test } from 'vitest';
import { ARCADE as C } from '../src/arcade/constants';
import { ArcadeGame, approach, dailySeed, type ArcadeInput } from '../src/arcade/game';
import { levelSettings, type LevelSettings } from '../src/arcade/levels';
import { catchScore } from '../src/arcade/score';

const idle: ArcadeInput = { left: false, right: false, burn: false };
const burn = { ...idle, burn: true };
const tick = 1 / 120;
function contact(game: ArcadeGame, dx = 0, vy = -0.5) {
  Object.assign(game.booster, { x: game.arms.x + dx, y: 0.001, vx: 0, vy });
  return game.step(tick, idle);
}
function levelWith(seed: number, test: (s: LevelSettings) => boolean) {
  for (let level = 2; level < 500; level++) if (test(levelSettings(level, seed >>> 0))) return level;
  throw new Error('no level matches');
}
function catches(game: ArcadeGame, count: number) {
  for (let i = 0; i < count; i++) {
    expect(contact(game).some(e => e.type === 'catch')).toBe(true);
    game.step(1.2, idle);
  }
}

describe('arcade physics and collisions', () => {
  test('free fall matches the analytic gravity and linear drag model', () => {
    const game = new ArcadeGame({ seed: 1 });
    game.booster.x = 30;
    const { y, vy } = game.booster;
    game.step(1, idle);
    const k = 12 / 70;
    expect(game.booster.vy).toBeCloseTo(-70 + (vy + 70) * Math.exp(-k), 8);
    expect(game.booster.y).toBeCloseTo(y - 70 + (vy + 70) * (1 - Math.exp(-k)) / k, 8);
  });

  test('burn reduces descent and drains only the seconds actually burned', () => {
    const falling = new ArcadeGame({ seed: 2 });
    const firing = new ArcadeGame({ seed: 2 });
    falling.step(0.5, idle);
    const events = firing.step(0.5, burn);
    expect(firing.booster.vy).toBeGreaterThan(falling.booster.vy);
    expect(falling.booster.fuel).toBe(7);
    expect(firing.booster.fuel).toBeCloseTo(6.5, 9);
    expect(events.filter(e => e.type === 'burnStart')).toHaveLength(1);
    expect(firing.step(tick, idle).some(e => e.type === 'burnStop')).toBe(true);
    expect(firing.booster.fuel).toBeCloseTo(6.5, 9);
  });

  test('fuel exhaustion emits once, stops burning and never makes fuel negative', () => {
    const game = new ArcadeGame({ seed: 1 });
    game.booster.fuel = tick / 2;
    const events = game.step(0.1, burn);
    expect(game.booster.fuel).toBe(0);
    expect(game.booster.burning).toBe(false);
    expect(events.filter(e => e.type === 'fuelOut')).toHaveLength(1);
    expect(events.filter(e => e.type === 'burnStop')).toHaveLength(1);
    expect(game.step(tick, burn).some(e => e.type === 'fuelOut')).toBe(false);
  });

  test('a fractional last fuel tick supplies only the remaining thrust time', () => {
    const game = new ArcadeGame({ seed: 1 });
    game.booster.fuel = tick / 2;
    game.booster.vy = 0;
    game.step(tick, burn);
    const decay = Math.exp(-(12 / 70) * tick / 2);
    const afterBurn = (14 / (12 / 70)) * (1 - decay);
    expect(game.booster.vy).toBeCloseTo(-70 + (afterBurn + 70) * decay, 10);
  });

  test('side controls oppose drag, strengthen during burn, cancel together, and cap cosmetic tilt', () => {
    const left = new ArcadeGame({ seed: 1 });
    const right = new ArcadeGame({ seed: 1 });
    const powered = new ArcadeGame({ seed: 1 });
    const neutral = new ArcadeGame({ seed: 1 });
    left.step(1, { ...idle, left: true });
    right.step(1, { ...idle, right: true });
    powered.step(1, { ...burn, right: true });
    neutral.step(1, { ...idle, right: true, left: true });
    expect(right.booster.vx).toBeCloseTo(7 / 1.2 * (1 - Math.exp(-1.2)), 9);
    expect(left.booster.vx).toBeCloseTo(-right.booster.vx, 9);
    expect(powered.booster.vx).toBeGreaterThan(right.booster.vx);
    expect(neutral.booster.vx).toBe(0);
    expect(powered.booster.tilt).toBeGreaterThan(0);
    expect(powered.booster.tilt).toBeLessThanOrEqual(8 * Math.PI / 180);
    expect(left.booster.tilt).toBeLessThan(0);
    const half = new ArcadeGame({ seed: 1 });
    half.step(1, { ...idle, right: true, steer: 0.5 });
    expect(half.booster.vx).toBeCloseTo(right.booster.vx * 0.5, 9);
  });

  test.each([
    [0, -0.5, 'catch', true], [3.4, -6.8, 'catch', false],
    [1.01, -0.5, 'catch', false], [0, -2.6, 'catch', false],
    [0, -7.1, 'crash', false], [3.51, -0.5, 'crash', false],
  ] as const)('contact dx=%s vy=%s gives %s', (dx, vy, type, perfect) => {
    const game = new ArcadeGame({ seed: 1 });
    const events = contact(game, dx, vy);
    expect(events.some(e => e.type === type)).toBe(true);
    expect(events.some(e => e.type === 'perfect')).toBe(perfect);
    if (type === 'catch') {
      expect(game.booster.y).toBe(0);
      expect(game.arms.closing).toBe(true);
      expect(game.lastCatch?.perfect).toBe(perfect);
      expect(game.lastCatch?.vy).toBeLessThan(0);
    }
  });

  test('approach cue: coasting high is good, fast and low says burn, hopeless says late', () => {
    expect(approach(300, -30).cue).toBe('good');
    expect(approach(40, -30).cue).toBe('burn');
    expect(approach(10, -30).cue).toBe('late');
    expect(approach(0, -2).cue).toBe('good');
    const { burnHeight } = approach(200, -30);
    expect(approach(burnHeight + 1, -30).cue).toBe('good');
    expect(approach(burnHeight - 1, -30).cue).toBe('burn');
  });

  test('crash events report offset and speed', () => {
    const game = new ArcadeGame({ seed: 1 });
    expect(contact(game, 0, -12)).toContainEqual(expect.objectContaining({ type: 'crash', reason: 'speed', speed: expect.closeTo(12, 1), offset: expect.closeTo(0, 3) }));
  });

  test('a tower column collision occurs before pin contact', () => {
    const game = new ArcadeGame({ seed: 1 });
    Object.assign(game.booster, { x: C.towerX, y: 50, vx: 0, vy: -1 });
    expect(game.step(tick, idle)).toContainEqual(expect.objectContaining({ type: 'crash', reason: 'tower' }));
  });

  test.each([[3.5, -7, false], [1, -2.5, true]] as const)(
    'catch boundaries are inclusive at dx=%s, vy=%s', (dx, vy, perfect) => {
      const game = new ArcadeGame({ seed: 1 });
      Object.assign(game.booster, { x: dx, y: 0, vx: 0, vy });
      const events = game.step(tick, idle);
      expect(events.some(e => e.type === 'catch')).toBe(true);
      expect(game.lastCatch?.perfect).toBe(perfect);
    });

  test('a fast sideways crossing cannot tunnel through the tower column', () => {
    const game = new ArcadeGame({ seed: 1 });
    Object.assign(game.booster, { x: -65, y: 50, vx: 10000, vy: 0 });
    expect(game.step(tick, idle)).toContainEqual(expect.objectContaining({ type: 'crash', reason: 'tower' }));
  });

  test('the booster bottom touching the ground crashes, even with pins above ground', () => {
    const game = new ArcadeGame({ seed: 1 });
    Object.assign(game.booster, { x: 50, y: C.groundY + 60, vy: -1 });
    expect(game.step(tick, idle)).toContainEqual(expect.objectContaining({ type: 'crash', reason: 'ground' }));
  });

  test('the whole 70 m body collides with a moving hazard', () => {
    const game = new ArcadeGame({ seed: 3 });
    catches(game, levelWith(3, s => s.lanes.length > 0) - 1);
    const hazard = game.hazards.find(h => Math.abs(h.x) < 70)!;
    expect(hazard).toBeDefined();
    Object.assign(game.booster, { x: hazard.x, y: hazard.y + 60, vx: 0, vy: -1 });
    expect(game.step(tick, idle)).toContainEqual(expect.objectContaining({ type: 'crash', reason: 'hazard' }));
  });

  test('celebration and explosion use the specified delays and close the arms', () => {
    const game = new ArcadeGame({ seed: 1 });
    contact(game);
    game.step(1.2 - tick, idle);
    expect(game.state).toBe('celebrate');
    expect(game.arms.closed).toBe(true);
    expect(game.step(tick, idle).some(e => e.type === 'spawn')).toBe(true);
    contact(game, 10);
    game.step(C.explodeTime - tick, idle);
    expect(game.state).toBe('exploding');
    expect(game.step(tick, idle).some(e => e.type === 'spawn')).toBe(true);
  });
});

describe('arcade progression and score', () => {
  test('score combines base, linear centering, softness, fuel, perfect and capped streak', () => {
    expect(catchScore({ dx: 3.5, vy: -7, fuel: 0, fuelMax: 7, streak: 1 })).toEqual({ points: 100, perfect: false, multiplier: 1 });
    expect(catchScore({ dx: 1.75, vy: -3.5, fuel: 3.5, fuelMax: 7, streak: 2 }).points).toBe(500);
    expect(catchScore({ dx: 0, vy: 0, fuel: 7, fuelMax: 7, streak: 1 }).points).toBe(800);
    expect(catchScore({ dx: 1, vy: -2.5, fuel: 0, fuelMax: 7, streak: 9 })).toEqual({ points: 2357, perfect: true, multiplier: 5 });
  });

  test('score is awarded once, streak caps at five and resets on crash', () => {
    const game = new ArcadeGame({ seed: 1 });
    catches(game, 6);
    expect(game.multiplier).toBe(5);
    expect(game.streak).toBe(6);
    const score = game.score;
    expect(score).toBeGreaterThan(0);
    contact(game, 10);
    expect(game.streak).toBe(0);
    expect(game.multiplier).toBe(1);
    game.step(1, idle);
    expect(game.score).toBe(score);
  });

  test('starts with three lives, earns one each ten catches, capped at five', () => {
    const game = new ArcadeGame({ seed: 1 });
    expect(game.lives).toBe(3);
    catches(game, 9);
    expect(game.lives).toBe(3);
    expect(contact(game).some(e => e.type === 'extraLife')).toBe(true);
    expect(game.lives).toBe(4);
    game.step(1.2, idle);
    catches(game, 20);
    expect(game.lives).toBe(5);
  });

  test('third crash ends the game after the explosion; SPACE retries and explicit restart reseeds', () => {
    const game = new ArcadeGame({ seed: 42 });
    const initial = { ...game.booster };
    for (let i = 0; i < 3; i++) {
      contact(game, 10);
      expect(game.lives).toBe(2 - i);
      const events = game.step(C.explodeTime, idle);
      expect(events.some(e => e.type === 'gameOver')).toBe(i === 2);
    }
    expect(game.state).toBe('gameOver');
    expect(game.step(1, idle)).toEqual([]);
    expect(game.step(0, burn).some(e => e.type === 'spawn')).toBe(true);
    expect(game.state).toBe('dropping');
    expect(game.booster).toEqual(initial);
    catches(game, 1);
    game.restart(5);
    expect(game.booster).toEqual(new ArcadeGame({ seed: 5 }).booster);
    expect(game.score).toBe(0);
    expect(game.lastCatch).toBeUndefined();
  });

  test('every catch advances the level; level 1 is clean and each later level stacks one new twist', () => {
    const game = new ArcadeGame({ seed: 3 });
    expect(game.conditions.twists).toEqual([]);
    expect(Math.abs(game.wind.base)).toBe(0);
    expect(game.lanes).toHaveLength(0);
    for (let level = 1; level < 8; level++) {
      expect(game.level).toBe(level);
      expect(contact(game)).toContainEqual(expect.objectContaining({ type: 'levelUp', level: level + 1 }));
      game.step(1.2, idle);
    }
    for (let level = 2; level <= 300; level++) {
      const s = levelSettings(level, 7);
      const cost = s.twists.reduce((sum, t) => sum + t.cost, 0);
      expect(cost).toBeLessThanOrEqual(C.maxBudget);
      expect(cost).toBeGreaterThan(0);
      // Stacking: this level keeps last level's twists, minus at most the one rotated out.
      const previous = levelSettings(level - 1, 7).twists.filter(t => t !== s.removed);
      expect(s.twists).toEqual([...previous, s.added].filter(Boolean));
      expect(s.added).not.toBeNull();
      expect(s.twists.filter(t => t.group === 'engine').length).toBeLessThanOrEqual(1);
      expect(new Set(s.twists.map(t => t.id)).size).toBe(s.twists.length);
      expect(s.speedScale).toBeLessThanOrEqual(C.maxSpeedScale);
      const ys = s.lanes.map(l => l.y);
      expect(new Set(ys).size).toBe(ys.length);
    }
    expect(levelSettings(12, 7)).toEqual(levelSettings(12, 7));
    expect(levelSettings(12, 7)).not.toEqual(levelSettings(12, 8));
  });

  test('a crash retries the same level with identical conditions', () => {
    const game = new ArcadeGame({ seed: 4 });
    catches(game, 5);
    const before = game.conditions;
    contact(game, 10);
    game.step(C.explodeTime, idle);
    expect(game.level).toBe(6);
    expect(game.conditions).toEqual(before);
  });

  test('arms actually move on a drifting-arms level', () => {
    const game = new ArcadeGame({ seed: 1 });
    catches(game, levelWith(1, s => s.movingArms) - 1);
    const x = game.arms.x;
    game.step(0.5, idle);
    expect(game.arms.x).not.toBe(x);
  });

  test('sticky valve delays thrust by the ignition lag and reports spooling', () => {
    const level = levelWith(1, s => s.ignitionLag > 0);
    const game = new ArcadeGame({ seed: 1 });
    catches(game, level - 1);
    game.booster.y = 1000;
    game.step(C.stickyLag - 0.05, burn);
    expect(game.booster.burning).toBe(false);
    expect(game.booster.spooling).toBe(true);
    game.step(0.1, burn);
    expect(game.booster.burning).toBe(true);
    expect(game.booster.spooling).toBe(false);
    expect(approach(200, -30, C.burnThrust, C.gravity, C.stickyLag).burnHeight)
      .toBeGreaterThan(approach(200, -30, C.burnThrust, C.gravity, 0).burnHeight);
    expect(approach(0.2, -2, C.burnThrust, C.gravity, C.stickyLag).cue).toBe('good');
  });

  test('solar flare warns for one second then blacks out instruments', () => {
    const game = new ArcadeGame({ seed: 5 });
    catches(game, levelWith(5, s => s.flares) - 1);
    let warning = -1, start = -1, end = -1;
    for (let i = 0; i < 3000 && end < 0; i++) {
      game.booster.y = 1000;
      for (const e of game.step(tick, idle)) {
        if (e.type === 'flareWarning' && warning < 0) warning = e.time;
        if (e.type === 'flare' && start < 0) { start = e.time; expect(game.flare.active).toBe(true); }
        if (e.type === 'flareEnd' && start >= 0) end = e.time;
      }
    }
    expect(start - warning).toBeCloseTo(C.flareWarningTime, 6);
    expect(end - start).toBeCloseTo(C.flareDuration, 6);
  });

  test('gust warning precedes the shove by one second and shove lasts 1.5 seconds', () => {
    const game = new ArcadeGame({ seed: 2 });
    catches(game, levelWith(2, s => s.gusts) - 1);
    let warningTime = -1;
    let gustTime = -1;
    let endTime = -1;
    for (let i = 0; i < 2000; i++) {
      game.booster.y = 1000;
      game.booster.x = 20;
      const events = game.step(tick, idle);
      if (events.some(e => e.type === 'gustWarning') && warningTime < 0) warningTime = i * tick;
      if (events.some(e => e.type === 'gust') && gustTime < 0) {
        gustTime = i * tick;
        expect(game.wind.warning).toBe(false);
        expect(game.wind.gust).not.toBe(0);
      }
      if (gustTime >= 0 && game.wind.gust === 0) { endTime = i * tick; break; }
    }
    expect(warningTime).toBeGreaterThanOrEqual(0);
    expect(gustTime - warningTime).toBeCloseTo(1, 8);
    expect(endTime - gustTime).toBeCloseTo(1.5, 8);
  });
});

describe('arcade reproducibility', () => {
  test('the same seed and input script produce identical events and state', () => {
    const a = new ArcadeGame({ seed: 99, daily: true });
    const b = new ArcadeGame({ seed: 99, daily: true });
    catches(a, levelWith(99, s => s.lanes.length > 0) - 1);
    catches(b, levelWith(99, s => s.lanes.length > 0) - 1);
    expect(a.hazards.length).toBeGreaterThan(0);
    for (let i = 0; i < 4000; i++) {
      const input = { left: i % 150 < 40, right: i % 150 > 100, burn: i % 100 < 70 };
      expect(a.step(1 / 60, input)).toEqual(b.step(1 / 60, input));
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('restart reproduces seeded lanes, spawn positions and gust scheduling', () => {
    const a = new ArcadeGame({ seed: 99 });
    catches(a, levelWith(99, s => s.lanes.length > 0) - 1);
    const first = { booster: { ...a.booster }, hazards: a.hazards.map(h => ({ ...h })), wind: { ...a.wind } };
    const events = a.step(4, idle);
    a.restart();
    catches(a, levelWith(99, s => s.lanes.length > 0) - 1);
    expect({ booster: a.booster, hazards: a.hazards, wind: a.wind }).toEqual(first);
    expect(a.step(4, idle)).toEqual(events);
    a.restart(100);
    catches(a, levelWith(99, s => s.lanes.length > 0) - 1);
    expect(a.hazards).not.toEqual(first.hazards);
  });

  test('frame partitioning preserves the fixed-step trajectory and events', () => {
    const a = new ArcadeGame({ seed: 12 });
    const b = new ArcadeGame({ seed: 12 });
    const once = a.step(2, burn);
    const split = Array.from({ length: 240 }, () => b.step(tick, burn)).flat();
    expect(a.booster).toEqual(b.booster);
    expect(once).toEqual(split);
    const c = new ArcadeGame({ seed: 12 });
    const before = { ...c.booster };
    c.step(tick / 2, idle);
    expect(c.booster).toEqual(before);
    c.step(tick / 2, idle);
    expect(c.booster.y).toBeLessThan(before.y);
  });

  test('frame partitioning also preserves time when game over occurs inside a frame', () => {
    const a = new ArcadeGame({ seed: 12 });
    const b = new ArcadeGame({ seed: 12 });
    const once = a.step(60, idle);
    const split = Array.from({ length: 3600 }, () => b.step(1 / 60, idle)).flat();
    expect(a.state).toBe('gameOver');
    expect(once).toEqual(split);
    expect(a.time).toBe(b.time);
  });

  test('invalid time deltas are rejected without mutating state', () => {
    const game = new ArcadeGame({ seed: 1 });
    for (const dt of [-1, NaN, Infinity]) expect(() => game.step(dt, idle)).toThrow(RangeError);
    expect(game.booster).toEqual(new ArcadeGame({ seed: 1 }).booster);
  });

  test('dailySeed uses the UTC calendar date, is stable and changes the following day', () => {
    expect(dailySeed(new Date('2026-11-21T00:00:00Z'))).toBe(dailySeed(new Date('2026-11-21T23:59:59Z')));
    expect(dailySeed(new Date('2026-11-21T23:59:59-08:00'))).toBe(dailySeed(new Date('2026-11-22T12:00:00Z')));
    expect(dailySeed(new Date('2026-11-21'))).not.toBe(dailySeed(new Date('2026-11-22')));
    expect(() => dailySeed(new Date(NaN))).toThrow(RangeError);
  });
});
