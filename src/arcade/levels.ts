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
export interface Twist { id: TwistId; name: string; cost: number; group?: 'engine' }
export interface LevelSettings {
  level: number;
  twists: readonly Twist[];
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
  { id: 'wind', name: 'Crosswind', cost: 1 },
  { id: 'gusts', name: 'Gust front', cost: 2 },
  { id: 'drone', name: 'Drone traffic', cost: 2 },
  { id: 'bird', name: 'Bird flock', cost: 2 },
  { id: 'balloon', name: 'Balloon race', cost: 2 },
  { id: 'movingArms', name: 'Drifting arms', cost: 2 },
  { id: 'fog', name: 'Low cloud', cost: 2 },
  { id: 'hot', name: 'Hot entry', cost: 1 },
  { id: 'shortTank', name: 'Short tank', cost: 1, group: 'engine' },
  { id: 'heavy', name: 'Heavy booster', cost: 1, group: 'engine' },
  { id: 'downdraft', name: 'Downdraft', cost: 1, group: 'engine' },
  { id: 'flare', name: 'Solar flare', cost: 2 },
  { id: 'sticky', name: 'Sticky valve', cost: 1 },
  { id: 'icyFins', name: 'Iced fins', cost: 1 },
  { id: 'narrow', name: 'Tight arms', cost: 2 },
  { id: 'wide', name: 'Wild spawn', cost: 1 },
];

/** Difficulty points to spend on twists: none on level 1, then growing to a cap. */
export function levelBudget(level: number): number {
  return level === 1 ? 0 : Math.min(C.maxBudget, 1 + Math.floor((level - 1) * C.budgetPerLevel));
}

/** Endless levels: level 1 is clean, every later level rolls twists from a seeded RNG,
 * so the same (seed, level) always gives the same conditions (crash retries are fair). */
export function levelSettings(level: number, seed = 0): LevelSettings {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('level must be a positive integer');
  const random = mulberry32((seed ^ Math.imul(level, 0x9e3779b1)) >>> 0);
  let budget = levelBudget(level);
  const picked: Twist[] = [];
  const pool = [...TWISTS];
  while (budget > 0) {
    const options = pool.filter(t => t.cost <= budget && !(t.group && picked.some(p => p.group === t.group)));
    if (!options.length) break;
    const twist = options[Math.floor(random() * options.length)];
    picked.push(twist); pool.splice(pool.indexOf(twist), 1); budget -= twist.cost;
  }
  const has = (id: TwistId) => picked.some(t => t.id === id);
  const ramp = Math.min(level, C.rampLevels) - 1;
  const speedScale = Math.min(C.maxSpeedScale, 1 + Math.max(0, level - C.rampLevels) * C.speedScalePerLevel);
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
    level, twists: picked,
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
