/** All arcade tuning lives here. World distances are metres; time is seconds.
 * +y is up, y=0 is the pin contact plane at the arm tops, vy<0 is falling.
 * The upright 9×70 m booster extends from pins−61 m to pins+9 m, ±4.5 m
 * horizontally: the pins are 9 m below the nose. Tilt is cosmetic only.
 */
export const ARCADE = {
  fixedStep: 1 / 120, // s
  gravity: 12, // m/s² downward
  burnThrust: 26, // m/s² upward (net +14 without drag)
  sidePush: 7, // m/s²
  burnSidePush: 10, // m/s²
  sideDrag: 1.2, // s⁻¹
  verticalDrag: 12 / 70, // s⁻¹; linear drag gives a 70 m/s terminal descent
  maxTilt: 8 * Math.PI / 180, // radians, cosmetic
  tiltResponse: 8, // s⁻¹
  halfWidth: 4.5, // m, booster
  belowPins: 61, // m, body below contact pins
  abovePins: 9, // m, nose above contact pins
  catchOffset: 3.5, // m, inclusive
  catchSpeed: 7, // m/s downward, inclusive
  perfectOffset: 1, // m, inclusive
  perfectSpeed: 2.5, // m/s downward, inclusive
  cueMargin: 0.7, // fraction of full-burn deceleration the burn cue plans with
  cueArrival: 3, // m/s, arrival speed the burn cue aims for
  worldHalfWidth: 80, // m, horizontal playfield (body kept inside)
  groundY: -90, // m relative to arm tops
  towerX: -42, // m, column centre
  towerWidth: 12, // m
  towerTop: 10, // m relative to arm tops; column extends to ground
  initialLives: 3, // boosters
  maxLives: 5, // boosters
  extraLifeCatches: 10, // catches per extra life
  catchesPerLevel: 1, // catches; every catch is a new level
  celebrateTime: 1.2, // s
  explodeTime: 3, // s; the crash card stays up this long
  armCloseTime: 0.15, // s
  basePoints: 100, // points
  centeringPoints: 100, // maximum points
  softnessPoints: 100, // maximum points
  fuelPoints: 100, // maximum points
  perfectMultiplier: 2, // dimensionless
  maxMultiplier: 5, // dimensionless
  scoreHistoryLimit: 10, // entries, for consumers persisting score history
  // Endless levels: base values ramp until rampLevels, then only speed scales.
  rampLevels: 20, // levels
  maxBudget: 9, // twist difficulty points held at once
  startHeight: 300, // m, level 1
  heightPerLevel: 6, // m/level
  startSpeed: 30, // m/s downward, level 1
  speedPerLevel: 0.4, // m/s/level
  startOffset: 40, // m, symmetric level-1 spawn range
  offsetPerLevel: 1, // m/level
  maxStartOffset: 70, // m
  startFuel: 7, // s of burn, level 1
  minFuel: 5, // s of burn at rampLevels
  speedScalePerLevel: 0.015, // additive speed scale per level
  maxSpeedScale: 1.5, // dimensionless
  // Twists.
  steadyWind: 0.65, // m/s²; direction seeded each drop
  windRange: 0.6, // m/s², seeded extra wind
  gustAcceleration: 2, // m/s² sideways, direction seeded
  gustWarningTime: 1, // s before gust onset
  gustDuration: 1.5, // s
  gustFirstDelay: 2.5, // s before first warning
  gustDelayJitter: 1, // s, seeded extra delay
  gustInterval: 3, // s from gust end to next warning, plus jitter
  flareFirstDelay: 2, // s before first solar flare warning
  flareWarningTime: 1, // s
  flareDuration: 2.5, // s of instrument blackout
  flareInterval: 3.5, // s from flare end to next warning, plus gust jitter
  armAmplitude: 5, // m sideways from x=0
  armAngularSpeed: 0.3, // radians/s
  fogBottom: 60, // m, cosmetic visibility band; physics unaffected
  fogTop: 125, // m
  fogDrift: 80, // m, seeded extra fog altitude
  hotEntrySpeed: 8, // m/s extra start speed
  shortTank: 0.7, // fuel multiplier
  heavyThrust: 22, // m/s²
  downdraftGravity: 14.5, // m/s²
  icyFins: 0.55, // sideways push multiplier
  stickyLag: 0.3, // s ignition delay
  narrowOffset: 2, // m catch window with tight arms
  wideSpawn: 1.5, // spawn range multiplier
  laneSlots: [0.15, 0.5, 0.85], // fractions of the drop column for hazard lanes
  hazardSpacing: 160, // m between periodic lane slots
  hazardSlots: 3, // slots per periodic lane, one seeded empty slot
  hazardGapSlots: 1, // empty slots per lane
  drone: { w: 10, h: 5, speed: 5 }, // m, m, m/s
  bird: { w: 8, h: 4, speed: 7 }, // m, m, m/s
  balloon: { w: 18, h: 14, speed: 2 }, // slow and wide, m/s
} as const;
