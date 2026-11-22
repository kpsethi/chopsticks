import { mulberry32 } from './rng';
import { ARCADE as C } from './constants';
import { levelSettings, type HazardKind, type HazardLane, type LevelSettings } from './levels';
import { catchScore } from './score';

export type ArcadeInput = { left: boolean; right: boolean; burn: boolean };
export type ArcadeState = 'dropping' | 'celebrate' | 'exploding' | 'gameOver';
export interface Booster { x: number; y: number; vx: number; vy: number; fuel: number; fuelMax: number; tilt: number; burning: boolean }
export interface Hazard { readonly lane: number; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly kind: HazardKind }
export interface LastCatch { dx: number; vy: number; points: number; perfect: boolean; streak: number }
export type CrashReason = 'arms' | 'speed' | 'tower' | 'ground' | 'hazard';
/** Event times are simulation seconds, including celebrations and explosions. */
export type ArcadeEvent = { time: number } & (
  | { type: 'spawn'; level: number; x: number; y: number }
  | ({ type: 'catch' | 'perfect' } & LastCatch)
  | { type: 'crash'; reason: CrashReason; x: number; y: number; offset: number; speed: number; maxOffset: number }
  | { type: 'levelUp'; level: number }
  | { type: 'extraLife'; lives: number }
  | { type: 'gameOver'; score: number; level: number }
  | { type: 'gustWarning' | 'gust'; acceleration: number }
  | { type: 'flareWarning' | 'flare' | 'flareEnd' }
  | { type: 'burnStart' | 'burnStop' | 'fuelOut' }
);
type EventPayload = ArcadeEvent extends infer E ? E extends ArcadeEvent ? Omit<E, 'time'> : never : never;
type MovingHazard = { -readonly [K in keyof Hazard]: Hazard[K] };
const EPSILON = 1e-10; // Floating point tolerance, not a gameplay tunable.

/** Exact solution of dv/dt = acceleration − drag*v over one constant-input interval. */
function integrate(position: number, velocity: number, acceleration: number, drag: number, dt: number) {
  const equilibrium = acceleration / drag;
  const decay = Math.exp(-drag * dt);
  return { position: position + equilibrium * dt + (velocity - equilibrium) * (1 - decay) / drag,
    velocity: equilibrium + (velocity - equilibrium) * decay };
}

/** Time of entry of a segment into a closed AABB, as a fraction of the segment. */
function hitTime(x: number, y: number, dx: number, dy: number, left: number, right: number, bottom: number, top: number) {
  let enter = 0, leave = 1;
  for (const [p, d, lo, hi] of [[x, dx, left, right], [y, dy, bottom, top]]) {
    if (Math.abs(d) < EPSILON) { if (p < lo || p > hi) return Infinity; }
    else {
      const a = (lo - p) / d, b = (hi - p) / d;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
  }
  return enter <= leave ? enter : Infinity;
}

export type ApproachCue = 'good' | 'burn' | 'late';
/** Descent advice from height above the arms and vertical speed, ignoring drag.
 * burnHeight is where a cueMargin-strength burn reaches the arms at cueArrival.
 * 'late' means even a full burn now arrives faster than catchSpeed. */
export function approach(y: number, vy: number, thrust: number = C.burnThrust, gravity: number = C.gravity): { cue: ApproachCue; burnHeight: number } {
  const h = Math.max(0, y), v = Math.max(0, -vy), full = thrust - gravity, plan = full * C.cueMargin;
  const burnHeight = Math.max(0, (v * v - C.cueArrival ** 2) / (2 * plan));
  const cue = v * v > C.catchSpeed ** 2 + 2 * full * h ? 'late' : v * v > C.cueArrival ** 2 + 2 * plan * h ? 'burn' : 'good';
  return { cue, burnHeight };
}

/** UTC calendar day, deliberately independent of locale, timezone and wall clock. */
export function dailySeed(date: Date): number {
  if (!Number.isFinite(date.getTime())) throw new RangeError('invalid daily date');
  return (date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate()) >>> 0;
}

/** Pure 2D arcade simulation. Call step with seconds and held buttons.
 * The constructor/restart queue a spawn event for the next step (including step(0)).
 * Rendering, audio and persistence consume state/events externally. Public positions
 * use metres and velocities m/s.
 */
export class ArcadeGame {
  state: ArcadeState = 'dropping';
  booster: Booster = { x: 0, y: 0, vx: 0, vy: 0, fuel: 0, fuelMax: 0, tilt: 0, burning: false };
  arms = { x: 0, closed: false, closing: false };
  wind = { base: 0, gust: 0, warning: false };
  flare = { warning: false, active: false };
  level = 1;
  score = 0;
  multiplier = 1;
  streak = 0;
  lives: number = C.initialLives;
  catches = 0;
  lastCatch?: LastCatch;
  readonly daily: boolean;
  private seed: number;
  private random: () => number;
  private settings: LevelSettings = levelSettings(1);
  private objects: MovingHazard[] = [];
  private accumulator = 0;
  private ticks = 0;
  private phaseTicks = 0;
  private armPhase = 0;
  private gustPhase: 'quiet' | 'warning' | 'gust' = 'quiet';
  private gustTicks = 0;
  private gustForce = 0;
  private flarePhase: 'quiet' | 'warning' | 'flare' = 'quiet';
  private flareTicks = 0;
  private heldTicks = 0;
  private pending: ArcadeEvent[] = [];

  constructor(opts: { seed: number; daily?: boolean }) {
    this.seed = opts.seed >>> 0;
    this.daily = opts.daily ?? false;
    this.random = mulberry32(this.seed);
    this.spawn();
  }

  get hazards(): readonly Hazard[] { return this.objects; }
  get lanes(): readonly HazardLane[] { return this.settings.lanes; }
  get fogBand() { return this.settings.fogBand; }
  /** The current level's rolled conditions (twists, thrust, catch window, ...). */
  get conditions(): Readonly<LevelSettings> { return this.settings; }
  get time() { return this.ticks * C.fixedStep; }

  restart(seed = this.seed): void {
    this.seed = seed >>> 0;
    this.random = mulberry32(this.seed);
    this.state = 'dropping';
    this.level = 1; this.score = 0; this.multiplier = 1; this.streak = 0;
    this.lives = C.initialLives; this.catches = 0; this.lastCatch = undefined;
    this.accumulator = 0; this.ticks = 0; this.phaseTicks = 0;
    this.pending = [];
    this.spawn();
  }

  step(dt: number, input: ArcadeInput): ArcadeEvent[] {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be finite and nonnegative');
    if (this.state === 'gameOver') {
      if (input.burn) this.restart();
      // Retrying is immediate and does not spend the old frame's dt on a new drop.
      return this.flush();
    }
    this.accumulator += dt;
    while (this.accumulator + EPSILON >= C.fixedStep) {
      this.accumulator = Math.max(0, this.accumulator - C.fixedStep);
      this.ticks++;
      this.fixedStep(input);
    }
    return this.flush();
  }

  private emit(event: EventPayload) { this.pending.push({ ...event, time: this.time } as ArcadeEvent); }
  private flush() { const events = this.pending; this.pending = []; return events; }

  private spawn() {
    this.settings = levelSettings(this.level, this.seed); // pure: a crash retries identical conditions
    const s = this.settings;
    this.state = 'dropping';
    this.phaseTicks = 0;
    this.booster = { x: (this.random() * 2 - 1) * s.startOffset, y: s.startHeight, vx: 0,
      vy: -s.startSpeed, fuel: s.fuel, fuelMax: s.fuel, tilt: 0, burning: false };
    this.armPhase = this.random() * 2 * Math.PI;
    this.arms = { x: s.movingArms ? C.armAmplitude * Math.sin(this.armPhase) : 0, closed: false, closing: false };
    this.wind = { base: s.wind * (this.random() < 0.5 ? -1 : 1), gust: 0, warning: false };
    this.gustPhase = 'quiet';
    this.gustTicks = Math.round((C.gustFirstDelay + this.random() * C.gustDelayJitter) / C.fixedStep);
    this.gustForce = 0;
    this.flare = { warning: false, active: false };
    this.flarePhase = 'quiet'; this.heldTicks = 0;
    this.flareTicks = Math.round((C.flareFirstDelay + this.random() * C.gustDelayJitter) / C.fixedStep);
    this.objects = [];
    const period = C.hazardSlots * C.hazardSpacing;
    for (const lane of s.lanes) {
      const phase = this.random() * C.hazardSpacing;
      const gap = Math.floor(this.random() * C.hazardSlots);
      for (let slot = 0; slot < C.hazardSlots; slot++) {
        if ((slot - gap + C.hazardSlots) % C.hazardSlots < C.hazardGapSlots) continue;
        const x = ((phase + slot * C.hazardSpacing + period / 2) % period) - period / 2;
        this.objects.push({ lane: lane.id, x, y: lane.y, w: lane.w, h: lane.h, kind: lane.kind });
      }
    }
    this.emit({ type: 'spawn', level: this.level, x: this.booster.x, y: this.booster.y });
  }

  private fixedStep(input: ArcadeInput) {
    if (this.state === 'gameOver') return;
    if (this.state !== 'dropping') {
      this.phaseTicks++;
      if (this.state === 'celebrate' && this.phaseTicks * C.fixedStep + EPSILON >= C.armCloseTime) {
        this.arms.closing = false; this.arms.closed = true;
      }
      const duration = this.state === 'celebrate' ? C.celebrateTime : C.explodeTime;
      if (this.phaseTicks * C.fixedStep + EPSILON >= duration) {
        if (this.lives === 0) {
          this.state = 'gameOver';
          this.accumulator = 0;
          this.emit({ type: 'gameOver', score: this.score, level: this.level });
        } else this.spawn();
      }
      return;
    }
    this.updateWind();
    this.updateFlare();
    // Sticky valve: thrust only after the button has been held for ignitionLag.
    this.heldTicks = input.burn ? this.heldTicks + 1 : 0;
    const lit = this.heldTicks * C.fixedStep + EPSILON >= this.settings.ignitionLag;
    const burning = input.burn && lit && this.booster.fuel > EPSILON;
    this.setBurning(burning);
    // A partially fuelled last tick gets only its remaining seconds of thrust.
    const poweredTime = burning ? Math.min(C.fixedStep, this.booster.fuel) : 0;
    if (poweredTime > 0) {
      this.advance(poweredTime, input, true);
      if (this.booster.fuel <= EPSILON) {
        this.booster.fuel = 0;
        this.setBurning(false);
        this.emit({ type: 'fuelOut' });
      }
    }
    if (this.state === 'dropping' && poweredTime < C.fixedStep) this.advance(C.fixedStep - poweredTime, input, false);
  }

  private setBurning(value: boolean) {
    if (this.booster.burning !== value) {
      this.booster.burning = value;
      this.emit({ type: value ? 'burnStart' : 'burnStop' });
    }
  }

  private updateWind() {
    if (!this.settings.gusts) return;
    if (--this.gustTicks > 0) return;
    if (this.gustPhase === 'quiet') {
      this.gustPhase = 'warning'; this.wind.warning = true;
      this.gustForce = (this.random() < 0.5 ? -1 : 1) * C.gustAcceleration * this.settings.speedScale;
      this.gustTicks = Math.round(C.gustWarningTime / C.fixedStep);
      this.emit({ type: 'gustWarning', acceleration: this.gustForce });
    } else if (this.gustPhase === 'warning') {
      this.gustPhase = 'gust'; this.wind.warning = false; this.wind.gust = this.gustForce;
      this.gustTicks = Math.round(C.gustDuration / C.fixedStep);
      this.emit({ type: 'gust', acceleration: this.gustForce });
    } else {
      this.gustPhase = 'quiet'; this.wind.gust = 0;
      this.gustTicks = Math.round((C.gustInterval + this.random() * C.gustDelayJitter) / C.fixedStep);
    }
  }

  private updateFlare() {
    if (!this.settings.flares) return;
    if (--this.flareTicks > 0) return;
    if (this.flarePhase === 'quiet') {
      this.flarePhase = 'warning'; this.flare.warning = true;
      this.flareTicks = Math.round(C.flareWarningTime / C.fixedStep);
      this.emit({ type: 'flareWarning' });
    } else if (this.flarePhase === 'warning') {
      this.flarePhase = 'flare'; this.flare = { warning: false, active: true };
      this.flareTicks = Math.round(C.flareDuration / C.fixedStep);
      this.emit({ type: 'flare' });
    } else {
      this.flarePhase = 'quiet'; this.flare.active = false;
      this.flareTicks = Math.round((C.flareInterval + this.random() * C.gustDelayJitter) / C.fixedStep);
      this.emit({ type: 'flareEnd' });
    }
  }

  private advance(dt: number, input: ArcadeInput, burning: boolean) {
    const b = this.booster;
    const oldX = b.x, oldY = b.y, oldVy = b.vy, oldArmX = this.arms.x;
    const side = Number(input.right) - Number(input.left);
    const ax = side * (burning ? C.burnSidePush : C.sidePush) * this.settings.sideScale + this.wind.base + this.wind.gust;
    const horizontal = integrate(b.x, b.vx, ax, C.sideDrag, dt);
    const vertical = integrate(b.y, b.vy, (burning ? this.settings.thrust : 0) - this.settings.gravity, C.verticalDrag, dt);
    const limit = C.worldHalfWidth - C.halfWidth;
    b.x = Math.max(-limit, Math.min(limit, horizontal.position));
    b.vx = b.x === horizontal.position ? horizontal.velocity : 0;
    b.y = vertical.position; b.vy = vertical.velocity;
    b.tilt += (Math.max(-1, Math.min(1, ax / C.burnSidePush)) * C.maxTilt - b.tilt) * (1 - Math.exp(-C.tiltResponse * dt));
    if (burning) b.fuel = Math.max(0, b.fuel - dt);
    if (this.settings.movingArms) {
      this.armPhase += C.armAngularSpeed * this.settings.speedScale * dt;
      this.arms.x = C.armAmplitude * Math.sin(this.armPhase);
    }
    const dx = b.x - oldX, dy = b.y - oldY;
    let collision = hitTime(oldX, oldY, dx, dy,
      C.towerX - C.towerWidth / 2 - C.halfWidth, C.towerX + C.towerWidth / 2 + C.halfWidth,
      C.groundY - C.abovePins, C.towerTop + C.belowPins);
    let reason: CrashReason = 'tower';
    const ground = oldY - C.belowPins <= C.groundY ? 0
      : b.y - C.belowPins <= C.groundY ? (C.groundY + C.belowPins - oldY) / dy : Infinity;
    if (ground < collision) { collision = ground; reason = 'ground'; }
    const period = C.hazardSlots * C.hazardSpacing;
    for (const h of this.objects) {
      const travel = this.lanes[h.lane].speed * dt;
      const hit = hitTime(oldX - h.x, oldY - h.y, dx - travel, dy,
        -h.w / 2 - C.halfWidth, h.w / 2 + C.halfWidth, -h.h / 2 - C.abovePins, h.h / 2 + C.belowPins);
      if (hit < collision) { collision = hit; reason = 'hazard'; }
      h.x = ((h.x + travel + period / 2) % period + period) % period - period / 2;
    }
    const contact = oldY >= 0 && b.y <= 0 && dy < 0 ? oldY / -dy : Infinity;
    if (collision <= 1 && collision <= contact) {
      b.x = oldX + dx * collision; b.y = oldY + dy * collision;
      this.crash(reason);
    } else if (contact <= 1) {
      b.x = oldX + dx * contact; b.y = 0;
      b.vy = oldVy + (b.vy - oldVy) * contact;
      this.arms.x = oldArmX + (this.arms.x - oldArmX) * contact;
      const offset = b.x - this.arms.x;
      if (Math.abs(offset) > this.settings.catchOffset) this.crash('arms');
      else if (-b.vy > C.catchSpeed) this.crash('speed');
      else this.catch(offset);
    }
  }

  private crash(reason: CrashReason) {
    this.setBurning(false);
    this.flare = { warning: false, active: false };
    this.state = 'exploding'; this.phaseTicks = 0;
    this.streak = 0; this.multiplier = 1; this.lives--;
    this.emit({ type: 'crash', reason, x: this.booster.x, y: this.booster.y,
      offset: Math.abs(this.booster.x - this.arms.x), speed: Math.max(0, -this.booster.vy), maxOffset: this.settings.catchOffset });
  }

  private catch(dx: number) {
    this.setBurning(false);
    this.flare = { warning: false, active: false };
    this.state = 'celebrate'; this.phaseTicks = 0;
    this.arms.closing = true;
    this.catches++; this.streak++;
    const result = catchScore({ dx, vy: this.booster.vy, fuel: this.booster.fuel, fuelMax: this.booster.fuelMax, streak: this.streak });
    this.multiplier = result.multiplier;
    this.lastCatch = { dx, vy: this.booster.vy, points: result.points, perfect: result.perfect, streak: this.streak };
    this.booster.vx = 0; this.booster.vy = 0;
    this.score += result.points;
    this.emit({ type: 'catch', ...this.lastCatch });
    if (result.perfect) this.emit({ type: 'perfect', ...this.lastCatch });
    if (this.catches % C.extraLifeCatches === 0 && this.lives < C.maxLives) {
      this.lives++; this.emit({ type: 'extraLife', lives: this.lives });
    }
    const level = Math.floor(this.catches / C.catchesPerLevel) + 1;
    if (level !== this.level) { this.level = level; this.emit({ type: 'levelUp', level }); }
  }
}
