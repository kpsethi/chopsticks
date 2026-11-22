# CHOPSTICKS Arcade — Design

User direction: "super simple (not necessarily easy) like Frogger — but addictive."

Arcade is the default mode. The existing career/sim stays available as "Sim".

## The whole game in one sentence

A booster falls toward the tower. **← → to slide, hold SPACE to burn.** Drop the pins into the chopsticks, soft and centered, without hitting anything on the way down.

## Rules

- **Drop.** Each drop takes about 10–20 s. The booster spawns above the screen top at a random x, already falling.
- **Controls:** three only.
  - ← / → push sideways. The grid fins work all the time, stronger while burning.
  - Hold SPACE to burn: vertical thrust, which drains fuel.
  - Touch: left third of the screen = ←, right third = →, middle = burn. Multi-touch allowed.
- **Booster.** Always upright. A visual tilt of up to 8° follows sideways acceleration; it's cosmetic only.
- **The catch** happens when the pins reach arm height:
  - **Centered:** |x − armsX| ≤ 1.5 m.
  - **Soft:** descent ≤ 3 m/s.
  - **Perfect:** |dx| ≤ 0.4 m and descent ≤ 1 m/s.
  - Arms snap shut automatically on a valid catch.
  - Anything else at arm height explodes: hitting the tower or arms, hitting the ground, or arriving too fast or off-center.
- **Hazards.** Touching a hazard while falling explodes the booster.
- **Out of fuel.** Burning stops and you fall.
- **Lives.** 3 boosters. An extra life every 10 catches, maximum 5.
- **After a catch** the next drop starts after a 1.2 s celebration. After a crash, a 1.5 s explosion, then the next drop or game over.
- **Game over** shows score, best, level and the "best catch" stat. SPACE retries instantly.

## Feel (arcade physics, 2D in x–y, z = 0)

| Quantity | Value |
|---|---|
| Gravity | 12 m/s² |
| Burn thrust | 26 m/s² up (net +14) |
| Sideways push | 7 m/s² (10 while burning) |
| Sideways drag | 1.2 /s |
| Terminal fall speed | ~70 m/s (light vertical drag) |
| Start height | 300 m above arm tops (level 1), rising with level |
| Start fall speed | 30 m/s (level 1) |
| Start x offset | random ±40 m (level 1), wider with level |
| Fuel | 7 s of burn (level 1), falling to 4 s by level 10 |

All of these are tunables in one constants block.

## Levels (every 3 catches)

| Level | Twist |
|---|---|
| 1 | Clean drop |
| 2 | Steady wind (constant sideways push; tower flag and streaks show it) |
| 3 | First hazard lane: drones crossing at one height |
| 4 | Gusts: a 1 s visible warning, then a 1.5 s sideways shove |
| 5 | Two hazard lanes (drones + birds, opposite directions, different speeds) |
| 6 | Arms slide slowly along x (moving target) |
| 7 | Balloon lane (slow, wide) + three lanes total |
| 8 | Low cloud band: hazards are hidden inside a fog band |
| 9 | Less fuel, faster start |
| 10+ | Everything; speeds scale +6% per level |

Hazard lanes are horizontal bands at fixed heights, each with objects moving at a constant speed, evenly spaced with seeded gaps. That's Frogger in reverse: you fall through the lanes. Hazards use simple hitboxes: the booster is a 9 × 70 m rectangle around its CoM, hazards are axis-aligned boxes.

## Scoring

Per catch:
- 100 base
- \+ centering up to 100 (linear in |dx|, 0 to 1.5 m)
- \+ softness up to 100 (linear in descent speed, 3 to 0 m/s)
- \+ fuel up to 100 (fraction of fuel left)

A PERFECT catch doubles the total. The streak multiplier is ×1 to ×5: +1 per consecutive catch, and it resets on a crash. Every catch pushes the score up through a big floating number.

Saved locally: best score, best level, longest streak, and the top 10 scores with dates.

**Daily challenge:** a seed from the date gives the same hazard layout and spawn positions for everyone that day. There's a separate "today's best".

## Screen

- Fixed side camera looking along −z, framing x ∈ [−80, 80] m and the whole drop column, with a slight 3/4 angle for depth. No camera switching.
- On the booster: a fuel bar beside it, and a speed gauge that turns green when it's soft enough.
- A vertical guide line from the booster down to arm height. The landing marker on the arms is green when you're aligned.
- Top bar: score, multiplier, level, lives as booster icons, and the best score.
- Popups: "PERFECT!", "+340", "STREAK ×4", "LEVEL 5 — DRONES".
- Reuse the existing renderer pieces: tower, booster, plume, explosion, shake, sound.

## Build plan

### Task 22: Arcade core
Pure TypeScript game logic in `src/arcade/` with unit tests and a bot test (in progress).

### Task 23: Arcade app
The only app after this task.
- **Entry.** `src/main.ts` boots `ArcadeApp` with no other modes. The old sim screens are no longer reachable.
- **Rendering.** `src/arcade/render/`. The camera is fixed: perspective, looking along −z with a slight downward and 3/4 angle, framing x ∈ [−80, 80] and y from the ground to the spawn height. On narrow (phone) aspect ratios, frame the drop column vertically.
  - Ported or simplified from the old renderer: sky gradient, ground and ocean, tower lattice with two arms (they snap closed on a catch and track `arms.x` on sliding levels), booster mesh, plume, explosion with shake, and a flag on the tower showing wind.
  - Hazards, low-poly and distinct at a glance: drones are dark quads with blinking red lights, birds are white V shapes that flap, balloons are big pastel spheres. The fog band is a translucent layer.
  - Gust warning: wind streaks flash with an arrow, then the shove.
- **In-world UI.**
  - A fuel bar beside the booster.
  - A speed bubble that turns green when slow enough to catch.
  - A drop line to arm height, with a landing marker that turns green when aligned.
  - Popups: "PERFECT!", "+340", "STREAK ×4", "LEVEL 5 — DRONES".
- **Top bar.** Score, ×multiplier, level, lives as booster icons, and best score.
- **Screens.**
  - **Title.** Logo, the line "← → slide · hold SPACE to burn", "PLAY", "DAILY CHALLENGE" (today's date and today's best), and the best score.
  - **Pause.** P or Esc.
  - **Game over.** Score, best, level, longest streak and best catch. SPACE / tap retries, M goes to the menu.
  - **Help.** One card: controls and catch rules.
- **Audio.** Reuse the synthesized engine (`src/audio/audio.ts`), adapted to the arcade:
  - burn rumble, gust whoosh, hazard proximity beep;
  - catch clank plus chord, perfect sparkle, crash, level-up jingle, extra-life chime.
  - M mutes.
- **Touch.** Hold the left third of the screen for ←, the middle for burn, the right third for →, with multi-touch. Visible faint touch zones on touch devices. Prevent scroll and zoom.
- **Persistence.** localStorage with try/catch: best score, top 10, today's daily best, and mute.
- **Social preview.** `index.html` gets a title, meta description and Open Graph / Twitter tags. `og:image` is a 1200×630 PNG in `public/og.png`, rendered from the game by a script using headless Chrome.
- **Performance.** 60 fps target, pixelRatio ≤ 2, no per-frame allocations.

### Task 24: Remove sim, deploy
- Delete `src/sim`, `src/render` (whatever wasn't moved into the arcade), `src/ui`, the old `src/game.ts` and `src/input.ts`, and their tests.
- Rewrite the README for the arcade game.
- Vite `base: './'` so the site works under `/chopsticks/`.
- `.github/workflows/pages.yml`: build plus deploy to GitHub Pages (`actions/deploy-pages`) on push to main.
- Run a secrets/PII scan, create the public repo `kpsethi/chopsticks`, push, enable Pages, then verify the live URL in a browser.
