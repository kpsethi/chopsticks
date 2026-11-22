import { ARCADE as C } from './constants';

export interface CatchScoreInput {
  dx: number; // m relative to arms
  vy: number; // m/s, negative downward
  fuel: number; // remaining seconds of burn
  fuelMax: number; // initial seconds of burn
  streak: number; // consecutive catches INCLUDING this catch
}

/** First catch earns ×1, second ×2, ...; round once after all bonuses. */
export function catchScore({ dx, vy, fuel, fuelMax, streak }: CatchScoreInput) {
  const unit = (n: number) => Math.max(0, Math.min(1, n));
  const descent = Math.max(0, -vy);
  const perfect = Math.abs(dx) <= C.perfectOffset && descent <= C.perfectSpeed;
  const multiplier = Math.max(1, Math.min(C.maxMultiplier, streak));
  const raw = C.basePoints + C.centeringPoints * unit(1 - Math.abs(dx) / C.catchOffset)
    + C.softnessPoints * unit(1 - descent / C.catchSpeed)
    + C.fuelPoints * unit(fuelMax > 0 ? fuel / fuelMax : 0);
  return { points: Math.round(raw * multiplier * (perfect ? C.perfectMultiplier : 1)), perfect, multiplier };
}
