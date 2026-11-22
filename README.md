# CHOPSTICKS

Seventy metres of steel. One soft landing. CHOPSTICKS is a three-button arcade game: slide a falling booster through traffic, time your burn, and settle its pins into a launch tower's chopsticks. Chase perfect catches and longer streaks as wind, moving arms, and airborne hazards make each drop harder, or try the shared daily challenge. Built with TypeScript, Three.js, and Vite for desktop and touch browsers.

## Controls

| Input | Action |
| --- | --- |
| Hold ← / → | Slide left / right |
| Hold Space | Burn to slow your descent; consumes fuel |
| P / Esc | Pause / resume |
| Space on title / game over | Start / retry |
| M | Mute / unmute; return to menu from game over |
| Touch: hold left / middle / right third | Slide left / burn / slide right |

Touch supports multiple fingers, so you can slide and burn together. Use the on-screen buttons to pause, mute, or open help; tap after game over to retry.

## Rules

- **Catch window:** when the pins descend to arm height, stay within 1.5 m of the arms' centre and descend at no more than 3 m/s. The arms close automatically on a valid catch. A missed or hard catch, tower collision, ground impact, or hazard collision costs a booster.
- **Perfect:** land within 0.4 m at no more than 1 m/s to double the catch score.
- **Scoring and streaks:** each catch earns 100 base points plus up to 100 each for centring, softness, and remaining fuel. Consecutive catches multiply the score from ×1 to ×5; a crash resets the streak.
- **Lives:** start with three boosters. Earn an extra life every ten catches, up to five lives. Empty fuel means no more burn for that drop.
- **Levels:** advance every three catches. Earlier twists remain active, while drops get higher, faster, and leaner on fuel through level 10.

| Level | New twist |
| --- | --- |
| 1 | Clean drop |
| 2 | Steady wind |
| 3 | Drone lane |
| 4 | Gusts with a one-second warning |
| 5 | Bird lane |
| 6 | Moving arms |
| 7 | Balloon lane |
| 8 | Fog band |
| 9 | Extra starting speed |
| 10+ | All twists; speeds increase by 6% per level above 10 |

**Daily challenge:** everyone gets the same seeded starting conditions for each UTC date, including spawn positions and hazard layouts. Retry to improve a separate daily best. Scores and records are stored locally on your device.

## Development

Use Node.js 20 and npm:

```sh
npm install
npm run dev
npm test
npm run build
```

The dev server runs at http://localhost:5173. Tests cover the arcade logic, controls, storage, and automated play. The production build type-checks the project and writes `dist/`; relative asset URLs allow hosting under `/chopsticks/`.

Deployed to GitHub Pages via .github/workflows/pages.yml
