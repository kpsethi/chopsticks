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

- **Catch window:** when the pins descend to arm height, stay within 3.5 m of the arms' centre (2 m with Tight arms) and descend at no more than 7 m/s. The arms close automatically on a valid catch. A missed or hard catch, tower collision, ground impact, or hazard collision costs a booster.
- **Perfect:** land within 1 m at no more than 2.5 m/s to double the catch score.
- **Scoring and streaks:** each catch earns 100 base points plus up to 100 each for centring, softness, and remaining fuel. Consecutive catches multiply the score from ×1 to ×5; a crash resets the streak.
- **Lives:** start with three boosters. Earn an extra life every ten catches, up to five lives. Empty fuel means no more burn for that drop.
- **Levels:** endless. Every catch is a new level; a crash retries the same level with the same conditions. Level 1 is a clean drop; every later level adds one random twist on top of the previous level's, and once the difficulty budget is full an old twist rotates out for a new one. Everything also gets a little faster each level. Active twists and what they do are listed under the score.
- **Feedback:** the drop line is green on glide, amber when it's time to burn, red when it's too late. Start burning when the booster's base reaches the red burn line. After a crash, the card shows your speed and offset for the full explosion.

| Twist | Effect |
| --- | --- |
| Crosswind | Steady sideways push |
| Gust front | Sideways shoves with a one-second warning |
| Drone traffic / Bird flock / Balloon race | Hazard lanes at random heights and directions |
| Drifting arms | The arms slide back and forth |
| Low cloud | Fog band hides traffic |
| Hot entry | Faster starting speed |
| Short tank | 30% less fuel |
| Heavy booster | Weaker engine |
| Downdraft | Stronger gravity |
| Solar flare | Instruments, drop line and brackets black out for 2.5 s, with a warning |
| Sticky valve | Engine lights 0.3 s after you press burn |
| Iced fins | Weaker sideways control |
| Tight arms | Catch window shrinks to 2 m |
| Wild spawn | Booster starts further from the tower |

At most one engine twist (short tank, heavy booster, downdraft) per level.

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
