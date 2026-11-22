import type { ArcadeInput } from './game';

type Control = keyof ArcadeInput;
export function touchZone(x: number, width: number): Control {
  return x < width / 3 ? 'left' : x < width * 2 / 3 ? 'burn' : 'right';
}

/** One stable input object; keyboard and fingers never release each other's holds. */
export class ArcadeControls {
  readonly input: ArcadeInput = { left: false, right: false, burn: false };
  private readonly keyboard: ArcadeInput = { left: false, right: false, burn: false };
  private readonly pointers = new Map<number, Control>();

  key(code: string, down: boolean): boolean {
    const control = code === 'ArrowLeft' ? 'left' : code === 'ArrowRight' ? 'right' : code === 'Space' ? 'burn' : null;
    if (!control) return false;
    this.keyboard[control] = down;
    this.sync();
    return true;
  }
  pointer(id: number, x: number, width: number): void {
    this.pointers.set(id, touchZone(x, width)); this.sync();
  }
  hasPointer(id: number): boolean { return this.pointers.has(id); }
  releasePointer(id: number): void { this.pointers.delete(id); this.sync(); }
  clear(): void {
    this.pointers.clear();
    this.keyboard.left = this.keyboard.right = this.keyboard.burn = false;
    this.sync();
  }
  private sync(): void {
    this.input.left = this.keyboard.left; this.input.right = this.keyboard.right; this.input.burn = this.keyboard.burn;
    for (const control of this.pointers.values()) this.input[control] = true;
  }
}
