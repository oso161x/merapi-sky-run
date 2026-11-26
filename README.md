# MERAPI SKY RUN

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/oso161x/merapi-sky-run/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/oso161x/merapi-sky-run/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A complete, original flight game for make.fun's **best-flight-game-20261126-0057**
bounty ("Make the best flight game", $500). Chase view over the Merapi valley:
twenty rings, balloons, crosswind gusts, fuel management, and one runway home.

## Play

Serve `game/` with any static server — `node serve.ts` → http://localhost:8080 —
and open it in desktop Chrome. No network requests, no build step.

- **↑ ↓** pitch · **← →** bank · **W / S** throttle · **mouse** steers ·
  **wheel** throttle · **SPACE** airbrake · **P** pause · **M** mute · **R** restart
- **Sortie 1 — Ring Run:** thread 8 gold rings over the valley.
- **Sortie 2 — Storm Pass:** 8 more past the Gate Peak. Watch the balloons
  and the gusts. Green rings refuel.
- **Sortie 3 — Homecoming:** 4 rings, then land on runway 27 — gentle sink,
  landing speed, aligned with the strip.

Score: rings pay 100 × a combo multiplier (up to ×3), a clean landing pays
500 plus fuel and time bonuses. Three hull hits, an empty tank over the
ridges, or a hard landing ends the sortie.

## Files

- `game/index.html` + `game/src/{config,random,terrain,world,audio,input,render,shots,main}.js`
  — the game, written from scratch in this session; the simulation (`world.js`)
  is pure and shared with the Node balance sim, so browser and sim must agree.
- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to `/output`
  and writes `dossier.json` via `vendor/makefun-game.ts`.
- `serve.ts` — local static server for play-testing.
- `shots.json` — the four screenshot scenes (`?shot=start|play|win|end&seed=7`).
- `tools/sim.mjs` — balance proof: skilled autopilot lands, idle and greedy
  pilots crash, on every seed tried.

## Determinism

Seeded RNG (`?seed=N`): the same seed builds the same valley, rings and sky.
Screenshot scenes run the same pilots as the balance sim and then freeze,
so a headless capture is pixel-identical on every run.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4s86eynw&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
