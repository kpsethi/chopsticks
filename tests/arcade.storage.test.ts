import { describe, expect, test } from 'vitest';
import { ArcadeStorage, STORAGE_KEY, type StoragePort } from '../src/arcade/storage';

function memory(initial: string | null = null): StoragePort {
  let value = initial;
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
}
const run = (score: number, daily = false, date = '2026-11-21') =>
  ({ score, level: 4, longestStreak: 7, bestCatch: 840, daily, date });

describe('arcade persistence', () => {
  test('survives absent, malformed, unavailable and quota-limited storage', () => {
    for (const port of [null, memory('{'), memory('null'), memory('{"bestScore":-1,"topScores":[null]}'),
      { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } }]) {
      const s = new ArcadeStorage(port);
      expect(s.data.bestScore).toBe(0);
      expect(() => s.record(run(123))).not.toThrow();
      expect(s.data.bestScore).toBe(123);
      expect(() => s.setMuted(true)).not.toThrow();
    }
  });
  test('persists records, mute, and sorted top ten dated scores', () => {
    const port = memory(), s = new ArcadeStorage(port);
    for (let score = 0; score < 12; score++) s.record(run(score * 100));
    s.setMuted(true);
    const loaded = new ArcadeStorage(port);
    expect(loaded.data.bestScore).toBe(1100);
    expect(loaded.data.bestLevel).toBe(4);
    expect(loaded.data.longestStreak).toBe(7);
    expect(loaded.data.topScores.map(r => r.score)).toEqual([1100, 1000, 900, 800, 700, 600, 500, 400, 300, 200]);
    expect(loaded.data.topScores[0].date).toBe('2026-11-21');
    expect(loaded.data.muted).toBe(true);
    expect(STORAGE_KEY).toContain('arcade');
  });
  test('daily records are separate and roll over by UTC date', () => {
    const s = new ArcadeStorage(memory());
    s.record(run(500)); s.record(run(200, true)); s.record(run(100, true));
    expect(s.dailyBest('2026-11-21')).toBe(200);
    expect(s.data.bestScore).toBe(500);
    expect(s.data.topScores).toHaveLength(1);
    expect(s.dailyBest('2026-11-22')).toBe(0);
    s.record(run(50, true, '2026-11-22'));
    expect(s.dailyBest('2026-11-22')).toBe(50);
    expect(new ArcadeStorage(memory(JSON.stringify(s.data))).dailyBest('2026-11-22')).toBe(50);
  });
  test('rejects invalid persisted values and invalid score entries', () => {
    const s = new ArcadeStorage(memory(JSON.stringify({ bestScore: '9000', bestLevel: null,
      longestStreak: -2, muted: 'false', topScores: [{ score: -1 }, { score: 'x' }],
      daily: { date: 'invalid', score: -9 } })));
    expect(s.data.bestScore).toBe(0);
    expect(s.data.bestLevel).toBe(1);
    expect(s.data.muted).toBe(false);
    expect(s.data.topScores).toEqual([]);
    expect(s.dailyBest('invalid')).toBe(0);
  });
});
