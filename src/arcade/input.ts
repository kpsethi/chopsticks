import type { ArcadeInput } from './game';

type Control = 'left' | 'right' | 'burn';

export const STICK = {
  maxRadius: 54, // px; anchor follows beyond this leash so reversing/cutting burn is instant
  deadzoneX: 12, // px; straight-up burns don't wobble sideways
  fullX: 48, // px; full lateral thrust reach
  burnUp: 18, // px upward drag required to ignite burn
} as const;

export interface ThumbstickState {
  anchorX: number;
  anchorY: number;
  knobX: number;
  knobY: number;
  left: boolean;
  right: boolean;
  burn: boolean;
  steer: number;
}

interface PointerStick {
  anchorX: number;
  anchorY: number;
  knobX: number;
  knobY: number;
  left: boolean;
  right: boolean;
  burn: boolean;
  steer: number;
}

function keyControl(code: string): Control | null {
  if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
  if (code === 'ArrowRight' || code === 'KeyD') return 'right';
  if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') return 'burn';
  return null;
}

/** Evaluate floating stick displacement with a circular follow-leash. */
function evaluateStick(stick: PointerStick, x: number, y: number): void {
  let dx = x - stick.anchorX;
  let dy = y - stick.anchorY;
  const dist = Math.hypot(dx, dy);
  if (dist > STICK.maxRadius) {
    const pull = (dist - STICK.maxRadius) / dist;
    stick.anchorX += dx * pull;
    stick.anchorY += dy * pull;
    dx = x - stick.anchorX;
    dy = y - stick.anchorY;
  }
  stick.knobX = stick.anchorX + dx;
  stick.knobY = stick.anchorY + dy;
  stick.burn = dy <= -STICK.burnUp;
  if (Math.abs(dx) <= STICK.deadzoneX) {
    stick.steer = 0;
  } else {
    const mag = Math.min(1, (Math.abs(dx) - STICK.deadzoneX) / (STICK.fullX - STICK.deadzoneX));
    stick.steer = Math.sign(dx) * mag;
  }
  stick.left = stick.steer < 0;
  stick.right = stick.steer > 0;
}

/** One stable input object; one-handed keyboard aliases and floating drag-anywhere thumbstick combine cleanly. */
export class ArcadeControls {
  readonly input: ArcadeInput = { left: false, right: false, burn: false };
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, PointerStick>();

  key(code: string, down: boolean): boolean {
    if (!keyControl(code)) return false;
    if (down) this.keys.add(code); else this.keys.delete(code);
    this.sync();
    return true;
  }

  pointerDown(id: number, x: number, y: number): ThumbstickState {
    const stick: PointerStick = {
      anchorX: x, anchorY: y, knobX: x, knobY: y,
      left: false, right: false, burn: false, steer: 0,
    };
    this.pointers.set(id, stick);
    this.sync();
    return stick;
  }

  pointerMove(id: number, x: number, y: number): ThumbstickState | null {
    const stick = this.pointers.get(id);
    if (!stick) return null;
    evaluateStick(stick, x, y);
    this.sync();
    return stick;
  }

  hasPointer(id: number): boolean { return this.pointers.has(id); }

  releasePointer(id: number): void {
    this.pointers.delete(id);
    this.sync();
  }

  activeStick(): ThumbstickState | null {
    let last: PointerStick | null = null;
    for (const s of this.pointers.values()) last = s;
    return last;
  }

  clear(): void {
    this.pointers.clear();
    this.keys.clear();
    this.sync();
  }

  private sync(): void {
    let keyLeft = false, keyRight = false, keyBurn = false;
    for (const code of this.keys) {
      const control = keyControl(code);
      if (control === 'left') keyLeft = true;
      else if (control === 'right') keyRight = true;
      else if (control === 'burn') keyBurn = true;
    }

    let ptrLeft = false, ptrRight = false, ptrBurn = false, ptrSteer = 0;
    for (const s of this.pointers.values()) {
      if (s.left) ptrLeft = true;
      if (s.right) ptrRight = true;
      if (s.burn) ptrBurn = true;
      ptrSteer += s.steer;
    }

    this.input.left = keyLeft || ptrLeft;
    this.input.right = keyRight || ptrRight;
    this.input.burn = keyBurn || ptrBurn;

    if (this.pointers.size > 0 && !keyLeft && !keyRight) {
      this.input.steer = Math.max(-1, Math.min(1, ptrSteer));
    } else {
      delete this.input.steer;
    }
  }
}
