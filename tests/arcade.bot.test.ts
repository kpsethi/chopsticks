import { describe, expect, test } from 'vitest';
import { ARCADE as C } from '../src/arcade/constants';
import { ArcadeGame, type ArcadeInput } from '../src/arcade/game';

const idle: ArcadeInput = { left: false, right: false, burn: false };

/** Only reads public state; never teleports, refuels, revives or rewinds the game. */
function bot(game: ArcadeGame): ArcadeInput {
  const b = game.booster;
  const speed = Math.max(0, -b.vy);
  const k = C.verticalDrag;
  const a = C.burnThrust - C.gravity;
  const stopDistance = speed / k - a / (k * k) * Math.log1p(k * speed / a);
  const burn = b.y < 3 ? speed > 1.5 : b.y <= stopDistance + 0.9;
  let target = game.arms.x;

  // Look through the full body's crossing interval, then slide to the nearest
  // clear corridor. Far-away lanes are ignored until the preceding lane clears.
  const lane = [...game.lanes].filter(l => b.y + 9 >= l.y - l.h / 2)
    .sort((l, r) => r.y - l.y)[0];
  if (lane && b.y - 61 - lane.y < 110) {
    const enter = Math.max(0, (b.y - 61 - lane.y - lane.h / 2) / Math.max(15, speed));
    const leave = Math.max(0, (b.y + 9 - lane.y + lane.h / 2) / Math.max(15, speed));
    const blocked = (x: number) => game.hazards.filter(h => h.lane === lane.id).some(h => {
      const start = h.x + lane.speed * enter;
      const end = h.x + lane.speed * leave;
      return x >= Math.min(start, end) - h.w / 2 - 8 && x <= Math.max(start, end) + h.w / 2 + 8;
    });
    let best = Infinity;
    for (let x = -22; x <= 65; x += 1) {
      const cost = 0.25 * Math.abs(x - b.x) + Math.abs(x - game.arms.x);
      if (!blocked(x) && cost < best) { target = x; best = cost; }
    }
  }
  const push = burn ? C.burnSidePush : C.sidePush;
  const desired = 2.5 * (target - b.x) - 3 * b.vx - game.wind.base - game.wind.gust;
  return { left: desired < -push * 0.12, right: desired > push * 0.12, burn };
}

function run(seed: number, controlled: boolean) {
  const game = new ArcadeGame({ seed });
  let drops = 0;
  let crashes = 0;
  const reasons: string[] = [];
  // 50 drops, at most 40 s each; a hung/hovering bot fails the drop assertion.
  for (let frame = 0; frame < 50 * 40 * 60 && drops < 50 && game.state !== 'gameOver'; frame++) {
    const events = game.step(1 / 60, controlled && game.state === 'dropping' ? bot(game) : idle);
    for (const e of events) {
      if (e.type === 'catch' || e.type === 'crash') drops++;
      if (e.type === 'crash') { crashes++; reasons.push(`${e.reason} x=${game.booster.x.toFixed(1)} vy=${game.booster.vy.toFixed(1)} fuel=${game.booster.fuel.toFixed(1)}`); }
    }
  }
  return { seed, level: game.level, score: game.score, catches: game.catches, drops, crashes, reasons, state: game.state };
}

describe('arcade playability', () => {
  test('a simple suicide-burn / PD / lane-dodging bot reaches level 4 on all seeds and 7 on two', () => {
    const results = [1, 2, 3, 4, 5].map(seed => run(seed, true));
    console.table(results.map(({ seed, level, score, catches, drops }) => ({ seed, level, score, catches, drops })));
    for (const r of results) {
      expect(r.level, `seed ${r.seed}: ${r.reasons.join(", ")}`).toBeGreaterThanOrEqual(4);
      expect(r.drops === 50 || r.state === 'gameOver').toBe(true);
    }
    expect(results.filter(r => r.level >= 7).length).toBeGreaterThanOrEqual(2);
  });

  test.each([1, 2, 3, 4, 5])('no input crashes every drop for seed %s', seed => {
    const result = run(seed, false);
    expect(result.catches).toBe(0);
    expect(result.crashes).toBe(3);
    expect(result.drops).toBe(3);
    expect(result.state).toBe('gameOver');
  });
});
