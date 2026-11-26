// MERAPI SKY RUN — balance proof, run in Node against the same world.js the
// browser game uses. Usage: node tools/sim.mjs [seed ...]
// Pilots: skilled (autopilot), idle (no input), greedy (full throttle, aims
// at rings, never climbs for terrain, never flares). The game is balanced
// when skilled WINS and idle + greedy LOSE on every seed.
import { createWorld, stepWorld, autopilotInput, greedyInput, idleInput } from '../game/src/world.js';

const seeds = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
if (seeds.length === 0) seeds.push(7, 11);

const MAX_STEPS = 60 * 400; // 400 s of flight, far past the ~150 s sortie

function runPilot(seed, pilotName, inputFn) {
  const s = createWorld(seed);
  s.status = 'flying';
  let steps = 0;
  let minClearance = Infinity;
  while (s.status === 'flying' && steps < MAX_STEPS) {
    const input = inputFn(s);
    stepWorld(s, input);
    steps += 1;
    const clearance = s.y - s.terrain.heightAt(s.x, s.z);
    if (clearance < minClearance) minClearance = clearance;
  }
  return {
    pilot: pilotName,
    seed,
    status: s.status,
    reason: s.crashReason || '',
    score: s.score,
    rings: `${s.ringsPassed}/${s.ringsTotal}`,
    fuel: Math.round(s.fuel),
    hull: Math.round(s.hull),
    time: s.elapsed.toFixed(1),
    z: Math.round(s.z),
    minClearance: Math.round(minClearance),
  };
}

let failures = 0;
for (const seed of seeds) {
  const skilled = runPilot(seed, 'skilled', autopilotInput);
  const idle = runPilot(seed, 'idle', idleInput);
  const greedy = runPilot(seed, 'greedy', greedyInput);
  console.log(`seed ${seed}`);
  for (const r of [skilled, idle, greedy]) {
    console.log(
      `  ${r.pilot.padEnd(8)} ${r.status.padEnd(8)} ${r.reason.padEnd(13)} ` +
        `score ${String(r.score).padStart(5)} rings ${r.rings} fuel ${String(r.fuel).padStart(3)} ` +
        `hull ${String(r.hull).padStart(3)} t=${r.time}s z=${r.z} minClear=${r.minClearance}m`,
    );
  }
  if (skilled.status !== 'landed') {
    console.log('  FAIL: skilled pilot did not land');
    failures += 1;
  }
  if (idle.status !== 'crashed') {
    console.log('  FAIL: idle pilot did not crash');
    failures += 1;
  }
  if (greedy.status !== 'crashed') {
    console.log('  FAIL: greedy pilot did not crash');
    failures += 1;
  }
}
console.log(failures === 0 ? 'BALANCE OK' : `BALANCE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
