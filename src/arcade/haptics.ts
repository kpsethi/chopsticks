import type { ArcadeEvent } from './game';

/** Best-effort tactile feedback via navigator.vibrate; silent no-op where unsupported. */
export class ArcadeHaptics {
  private pulse(pattern: number | number[]): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      /* Ignore browsers that restrict vibration outside user gestures. */
    }
  }

  /** Entering the burn row with a thumb. */
  burn(): void { this.pulse(10); }

  /** Crossing between steering cells so eyes stay on the booster. */
  step(): void { this.pulse(6); }

  event(event: ArcadeEvent): void {
    switch (event.type) {
      case 'catch':
        this.pulse(event.perfect ? [14, 38, 24] : 18);
        break;
      case 'crash':
        this.pulse([45, 30, 70]);
        break;
      case 'extraLife':
        this.pulse([12, 28, 12, 28, 22]);
        break;
      case 'fuelOut':
        this.pulse(24);
        break;
      case 'gust':
      case 'flare':
        this.pulse([16, 24, 16]);
        break;
    }
  }
}
