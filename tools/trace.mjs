// Debug trace: fly the skilled pilot on one seed, log rings + state.
import { createWorld, stepWorld, autopilotInput } from '../game/src/world.js';

const seed = Number(process.argv[2] || 7);
const s = createWorld(seed);
s.status = 'flying';
let steps = 0;
let lastLog = -1;
while (s.status === 'flying' && steps < 60 * 400) {
  const before = s.ringsPassed;
  const input = autopilotInput(s);
  stepWorld(s, input);
  steps += 1;
  if (s.ringsPassed !== before) {
    const r = s.terrain.rings[s.ringsPassed - 1];
    console.log(
      `t=${s.elapsed.toFixed(1)} RING ${r.index} passed at (${s.x.toFixed(0)}, ${s.y.toFixed(0)}, ${s.z.toFixed(0)}) score=${s.score} combo=${s.combo}`,
    );
  }
  for (const r of s.terrain.rings) {
    if (r.missed && !r._logged) {
      r._logged = true;
      console.log(
        `t=${s.elapsed.toFixed(1)} RING ${r.index} MISSED (plane at ${s.x.toFixed(0)}, ${s.y.toFixed(0)}, ${s.z.toFixed(0)}; ring at ${r.x}, ${r.y}, ${r.z})`,
      );
    }
  }
  if (Math.floor(s.elapsed) >= lastLog + 5) {
    lastLog = Math.floor(s.elapsed);
    const next = s.terrain.rings.find((r) => !r.passed && !r.missed);
    console.log(
      `t=${s.elapsed.toFixed(1)} pos=(${s.x.toFixed(0)}, ${s.y.toFixed(0)}, ${s.z.toFixed(0)}) ` +
        `hdg=${(s.heading * 57.3).toFixed(1)} pitch=${(s.pitch * 57.3).toFixed(1)} bank=${(s.bank * 57.3).toFixed(1)} ` +
        `spd=${s.speed.toFixed(0)} thr=${s.throttle.toFixed(2)} fuel=${s.fuel.toFixed(0)} ` +
        `next=${next ? `#${next.index} (${next.x}, ${next.y}, ${next.z})` : 'none'} ` +
        `gnd=${s.terrain.heightAt(s.x, s.z).toFixed(0)}`,
    );
  }
}
console.log(`END status=${s.status} reason=${s.crashReason} score=${s.score} rings=${s.ringsPassed} t=${s.elapsed.toFixed(1)} pos=(${s.x.toFixed(0)}, ${s.y.toFixed(0)}, ${s.z.toFixed(0)})`);
