import { ARCADE as C } from './constants';
import { mulberry32 } from './rng';

export type HazardKind = 'drone' | 'bird' | 'balloon';
export interface HazardLane {
  readonly id: number;
  readonly kind: HazardKind;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly speed: number;
}
export type TwistId = 'wind' | 'gusts' | 'drone' | 'bird' | 'balloon' | 'movingArms' | 'fog' | 'hot'
  | 'shortTank' | 'heavy' | 'downdraft' | 'flare' | 'sticky' | 'icyFins' | 'narrow' | 'wide';
export interface Twist { id: TwistId; name: string; effect: string; cost: number; group?: 'engine' }
export interface LevelSettings {
  level: number;
  twists: readonly Twist[];
  added: Twist | null; // twist new this level
  removed: Twist | null; // twist rotated out this level
  wind: number;
  gusts: boolean;
  flares: boolean;
  lanes: readonly HazardLane[];
  movingArms: boolean;
  fogBand: { bottom: number; top: number } | null;
  fuel: number;
  thrust: number; // m/s² while burning
  gravity: number; // m/s²
  sideScale: number; // multiplier on sideways push
  ignitionLag: number; // s the burn button must be held before thrust
  catchOffset: number; // m
  startHeight: number;
  startSpeed: number;
  startOffset: number;
  speedScale: number;
}

/** Every twist a level can roll. Cost is its share of the level's difficulty budget;
 * at most one 'engine' twist is rolled so a stopping burn always stays affordable. */
export const TWISTS: readonly Twist[] = [
  { id: 'wind', name: 'Crosswind', effect: 'Steady wind pushes you sideways', cost: 1 },
  { id: 'gusts', name: 'Gust front', effect: 'Sudden sideways shoves, after a warning', cost: 2 },
  { id: 'drone', name: 'Drone traffic', effect: 'Drones cross your path: find a gap', cost: 2 },
  { id: 'bird', name: 'Bird flock', effect: 'Birds cross your path: find a gap', cost: 2 },
  { id: 'balloon', name: 'Balloon race', effect: 'Wide, slow balloons drift across', cost: 2 },
  { id: 'movingArms', name: 'Drifting arms', effect: 'The catch arms slide back and forth', cost: 2 },
  { id: 'fog', name: 'Low cloud', effect: 'A cloud band hides any traffic inside it', cost: 2 },
  { id: 'hot', name: 'Hot entry', effect: 'Booster arrives faster', cost: 1 },
  { id: 'shortTank', name: 'Short tank', effect: '30% less fuel', cost: 1, group: 'engine' },
  { id: 'heavy', name: 'Heavy booster', effect: 'Weaker engine: burn earlier', cost: 1, group: 'engine' },
  { id: 'downdraft', name: 'Downdraft', effect: 'Stronger gravity: burn earlier', cost: 1, group: 'engine' },
  { id: 'flare', name: 'Solar flare', effect: 'Instruments black out for a few seconds', cost: 2 },
  { id: 'sticky', name: 'Sticky valve', effect: 'Engine lights a beat after you press burn', cost: 1 },
  { id: 'icyFins', name: 'Iced fins', effect: 'Weaker sideways steering', cost: 1 },
  { id: 'narrow', name: 'Tight arms', effect: 'Catch window shrinks to 2 m', cost: 2 },
  { id: 'wide', name: 'Wild spawn', effect: 'Starts farther from the tower', cost: 1 },
];

/** Twists stack: every level after the first adds one new twist on top of the last
 * level's. Once the difficulty budget is full, one old twist rotates out for a new one
 * (and the speed ramp carries on), so each level is at least as hard as the one before.
 * Pure in (seed, level), so a crash retries identical conditions. */
function rollTwists(level: number, seed: number) {
  const random = mulberry32((seed ^ 0x5eed7157) >>> 0);
  let picked: Twist[] = [], added: Twist | null = null, removed: Twist | null = null;
  const cost = (list: Twist[]) => list.reduce((sum, t) => sum + t.cost, 0);
  const fits = (list: Twist[]) => TWISTS.filter(t => !list.includes(t) && cost(list) + t.cost <= C.maxBudget
    && !(t.group && list.some(p => p.group === t.group)));
  for (let l = 2; l <= level; l++) {
    added = removed = null;
    let options = fits(picked);
    if (!options.length) {
      removed = picked[Math.floor(random() * picked.length)];
      picked = picked.filter(t => t !== removed);
      options = fits(picked).filter(t => t !== removed);
    }
    added = options[Math.floor(random() * options.length)] ?? null;
    if (added) picked = [...picked, added];
  }
  return { picked, added, removed };
}

export function levelSettings(level: number, seed = 0): LevelSettings {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('level must be a positive integer');
  const random = mulberry32((seed ^ Math.imul(level, 0x9e3779b1)) >>> 0);
  const { picked, added, removed } = rollTwists(level, seed);
  const has = (id: TwistId) => picked.some(t => t.id === id);
  const ramp = Math.min(level, C.rampLevels) - 1;
  const speedScale = Math.min(C.maxSpeedScale, 1 + (level - 1) * C.speedScalePerLevel);
  const startHeight = C.startHeight + ramp * C.heightPerLevel;
  const lanes: HazardLane[] = [];
  // Lanes take distinct shuffled altitude slots so they never overlap.
  const slots = C.laneSlots.map(f => f * (startHeight - 90) + 40).sort(() => random() - 0.5);
  for (const kind of ['drone', 'bird', 'balloon'] as const) {
    if (!has(kind)) continue;
    const config = C[kind];
    const direction = random() < 0.5 ? -1 : 1;
    lanes.push({ id: lanes.length, kind, y: slots[lanes.length], w: config.w, h: config.h, speed: Math.abs(config.speed) * direction * speedScale });
  }
  const fogBottom = C.fogBottom + random() * C.fogDrift;
  return {
    level, twists: picked, added, removed,
    wind: has('wind') ? C.steadyWind + random() * C.windRange : 0,
    gusts: has('gusts'), flares: has('flare'), lanes, movingArms: has('movingArms'),
    fogBand: has('fog') ? { bottom: fogBottom, top: fogBottom + C.fogTop - C.fogBottom } : null,
    fuel: (C.startFuel - ramp * (C.startFuel - C.minFuel) / (C.rampLevels - 1)) * (has('shortTank') ? C.shortTank : 1),
    thrust: has('heavy') ? C.heavyThrust : C.burnThrust,
    gravity: has('downdraft') ? C.downdraftGravity : C.gravity,
    sideScale: has('icyFins') ? C.icyFins : 1,
    ignitionLag: has('sticky') ? C.stickyLag : 0,
    catchOffset: has('narrow') ? C.narrowOffset : C.catchOffset,
    startHeight,
    startSpeed: (C.startSpeed + ramp * C.speedPerLevel + (has('hot') ? C.hotEntrySpeed : 0)) * speedScale,
    startOffset: Math.min(C.maxStartOffset, (C.startOffset + ramp * C.offsetPerLevel) * (has('wide') ? C.wideSpawn : 1)), speedScale,
  };
}
