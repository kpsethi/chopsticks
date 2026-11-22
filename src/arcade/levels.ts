import { ARCADE as C } from './constants';

export type HazardKind = 'drone' | 'bird' | 'balloon';
export interface HazardLane {
  readonly id: number;
  readonly kind: HazardKind;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly speed: number;
}
export interface LevelSettings {
  level: number;
  wind: number;
  gusts: boolean;
  lanes: readonly HazardLane[];
  movingArms: boolean;
  fogBand: { bottom: number; top: number } | null;
  fuel: number;
  startHeight: number;
  startSpeed: number;
  startOffset: number;
  speedScale: number;
}

/** Each row adds its twist; subsequent levels retain earlier twists. */
const TWISTS = [
  {}, { wind: true }, { drones: true }, { gusts: true }, { birds: true },
  { movingArms: true }, { balloons: true }, { fog: true }, { fastStart: true }, {},
] as const;

export function levelSettings(level: number): LevelSettings {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('level must be a positive integer');
  const twist = Object.assign({}, ...TWISTS.slice(0, level)) as {
    wind?: boolean; gusts?: boolean; movingArms?: boolean; fog?: boolean; fastStart?: boolean;
  };
  const ramp = Math.min(level, C.scalingLevel) - 1;
  const speedScale = 1 + Math.max(0, level - C.scalingLevel) * C.speedScalePerLevel;
  const lanes: HazardLane[] = [];
  for (const kind of ['drone', 'bird', 'balloon'] as const) {
    const config = C[kind];
    if (level >= config.level) lanes.push({ id: lanes.length, kind, y: config.y, w: config.w, h: config.h, speed: config.speed * speedScale });
  }
  return {
    level, wind: twist.wind ? C.steadyWind + (ramp - 1) * C.windPerLevel : 0,
    gusts: !!twist.gusts, lanes, movingArms: !!twist.movingArms,
    fogBand: twist.fog ? { bottom: C.fogBottom, top: C.fogTop } : null,
    fuel: C.startFuel - Math.min(ramp, C.fuelRampLevels) * (C.startFuel - C.minFuel) / C.fuelRampLevels,
    startHeight: C.startHeight + ramp * C.heightPerLevel,
    startSpeed: (C.startSpeed + ramp * C.speedPerLevel + (twist.fastStart ? C.lateStartSpeed : 0)) * speedScale,
    startOffset: C.startOffset + ramp * C.offsetPerLevel, speedScale,
  };
}
