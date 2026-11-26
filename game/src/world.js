// MERAPI SKY RUN — flight model, missions, scoring and pilots.
// One file, one job: the whole game simulation with no DOM, no canvas, no
// audio, so the browser game and the Node balance sim run the same code and
// must agree. Every step is deterministic for a fixed seed and input stream.

import { CFG, MISSIONS, RING_TOTAL } from './config.js';
import { buildTerrain } from './terrain.js';

const DT = 1 / 60;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createWorld(seed) {
  const terrain = buildTerrain(seed);
  return {
    seed,
    terrain,
    time: 0,
    elapsed: 0,
    // Aircraft state.
    x: CFG.startX,
    y: CFG.startY,
    z: CFG.startZ,
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: CFG.startSpeed,
    throttle: CFG.startThrottle,
    vy: 0,
    // Resources and score.
    fuel: CFG.fuelStart,
    hull: CFG.hullStart,
    score: 0,
    combo: 0,
    bestCombo: 0,
    ringsPassed: 0,
    ringsTotal: RING_TOTAL,
    phase: 0,
    // Flow.
    status: 'title', // title | flying | paused | landed | crashed
    crashReason: '',
    invuln: 0,
    shake: 0,
    messages: [], // { text, ttl } toasts for the HUD
    events: [], // drained each frame by the game for sound effects
    gust: 0,
    landedAt: 0,
  };
}

export function nextRing(s) {
  for (const r of s.terrain.rings) if (!r.passed && !r.missed) return r;
  return null;
}

function pushMessage(s, text, ttl = 2.6) {
  s.messages.push({ text, ttl });
  if (s.messages.length > 4) s.messages.shift();
}

function phaseFor(z) {
  if (z < MISSIONS[0].z1) return 0;
  if (z < MISSIONS[1].z1) return 1;
  return 2;
}

// One fixed step of the simulation. input: { pitch, roll, throttle, brake }
// with pitch/roll in [-1, 1]; throttle null means "hold the current setting".
export function stepWorld(s, input, dt = DT) {
  if (s.status !== 'flying') return;
  s.time += dt;
  s.elapsed += dt;

  // --- Controls: bank and pitch chase the stick. ---
  const targetBank = clamp(input.roll, -1, 1) * CFG.maxBank;
  s.bank += clamp(targetBank - s.bank, -CFG.bankResponse * dt, CFG.bankResponse * dt);
  const targetPitch = clamp(input.pitch, -1, 1) * CFG.maxPitch;
  s.pitch += clamp(targetPitch - s.pitch, -CFG.pitchResponse * dt, CFG.pitchResponse * dt);

  // --- Throttle and speed. ---
  if (input.throttle !== null && input.throttle !== undefined) {
    s.throttle = clamp(input.throttle, 0, 1);
  }
  const engineOut = s.fuel <= 0;
  let targetSpeed = CFG.minSpeed + (engineOut ? 0 : s.throttle) * (CFG.maxSpeed - CFG.minSpeed);
  targetSpeed -= Math.max(0, s.pitch) * CFG.climbBleed;
  if (input.brake) targetSpeed *= 0.55;
  s.speed += clamp(targetSpeed - s.speed, -CFG.speedResponse * 40 * dt, CFG.speedResponse * 40 * dt);

  // --- Motion: coordinated turn, climb/descent, gusts. ---
  const turnRate = (CFG.gravityTurn * Math.tan(s.bank)) / Math.max(30, s.speed) * CFG.turnFactor;
  s.heading = wrapAngle(s.heading + turnRate * dt);
  s.vy = Math.sin(s.pitch) * s.speed - (engineOut ? 6 : 0);
  s.x += Math.sin(s.heading) * s.speed * dt;
  s.y += s.vy * dt;
  s.z += Math.cos(s.heading) * s.speed * dt;

  // Crosswind gusts from sortie 2 on: push the aircraft sideways and wobble it.
  if (s.z > CFG.gustStartZ) {
    const g = Math.sin(s.time * 0.9 + s.z * 0.0021) * Math.sin(s.time * 0.37);
    s.gust = g * 14;
    s.x += s.gust * dt;
    s.bank += g * 0.05 * dt;
  } else {
    s.gust = 0;
  }

  // --- Fuel. ---
  if (!engineOut) {
    s.fuel = Math.max(0, s.fuel - s.throttle * CFG.fuelBurnFull * dt);
    if (s.fuel <= 0) {
      pushMessage(s, 'FUEL EMPTY — GLIDING', 3);
      s.events.push('fuel-empty');
    }
  }

  if (s.invuln > 0) s.invuln -= dt;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 2.2);
  for (const m of s.messages) m.ttl -= dt;
  s.messages = s.messages.filter((m) => m.ttl > 0);

  // --- Phase. ---
  const phase = phaseFor(s.z);
  if (phase !== s.phase) {
    s.phase = phase;
    if (phase === 1) pushMessage(s, MISSIONS[1].name, 3.2);
    if (phase === 2) pushMessage(s, MISSIONS[2].name, 3.2);
    s.events.push('phase');
  }

  // --- Rings. ---
  for (const r of s.terrain.rings) {
    if (r.passed || r.missed) continue;
    const dx = s.x - r.x;
    const dy = s.y - r.y;
    const dz = s.z - r.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < r.r) {
      r.passed = true;
      s.ringsPassed += 1;
      s.combo += 1;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const mult = Math.min(CFG.comboCap, 1 + CFG.comboStep * (s.combo - 1));
      if (r.type === 'fuel') {
        s.fuel = Math.min(100, s.fuel + CFG.fuelRingBonus);
        s.score += CFG.fuelRingScore;
        pushMessage(s, `FUEL RING +${CFG.fuelRingScore}  ·  FUEL +${CFG.fuelRingBonus}`);
        s.events.push('fuel-ring');
      } else {
        const pts = Math.round(CFG.ringScore * mult);
        s.score += pts;
        pushMessage(s, `RING +${pts}${s.combo > 1 ? `  ·  COMBO x${mult.toFixed(2)}` : ''}`);
        s.events.push('ring');
      }
    } else if (s.z > r.z + 60) {
      r.missed = true;
      if (s.combo > 0) pushMessage(s, 'RING MISSED — COMBO LOST');
      s.combo = 0;
    }
  }

  // --- Balloons. ---
  for (const b of s.terrain.balloons) {
    if (b.popped) continue;
    const dx = s.x - b.x;
    const dy = s.y - b.y;
    const dz = s.z - b.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < b.r + 7 && s.invuln <= 0) {
      b.popped = true;
      s.hull -= CFG.balloonDamage;
      s.invuln = CFG.invulnSeconds;
      s.shake = 1;
      s.combo = 0;
      pushMessage(s, `BALLOON STRIKE — HULL ${Math.max(0, Math.round(s.hull))}%`, 3);
      s.events.push('hit');
      if (s.hull <= 0) return crash(s, 'balloon');
    }
  }

  // --- Terrain and landing. ---
  const ground = s.terrain.heightAt(s.x, s.z);
  const rw = s.terrain.runway;
  const onRunwayStrip = s.z >= rw.z0 && s.z <= rw.z1 && Math.abs(s.x) < rw.x1 + 12;
  if (s.y <= ground + 1.5) {
    if (onRunwayStrip && Math.abs(s.x) < rw.x1) {
      const sink = -s.vy;
      const aligned = Math.abs(s.heading) < CFG.landMaxHeading;
      if (
        sink <= CFG.landMaxSink &&
        s.speed >= CFG.landMinSpeed &&
        s.speed <= CFG.landMaxSpeed &&
        aligned
      ) {
        return land(s);
      }
      return crash(s, sink > CFG.landMaxSink ? 'hard-landing' : 'runway-crash');
    }
    return crash(s, 'terrain');
  }

  // --- Overshoot: flew past the runway with nowhere to land. ---
  if (s.z > rw.z1 + 400) return crash(s, 'overshoot');
}

function land(s) {
  s.status = 'landed';
  s.landedAt = s.elapsed;
  s.y = s.terrain.runway.elev + 1.2;
  const timeBonus = Math.max(0, Math.round((CFG.parSeconds - s.elapsed) * CFG.timeBonusPerSec));
  const fuelBonus = Math.round(s.fuel * CFG.fuelBonusPerUnit);
  s.score += CFG.landBonus + timeBonus + fuelBonus;
  s.events.push('land');
  pushMessage(s, `TOUCHDOWN — RUNWAY 27  ·  +${CFG.landBonus}`, 4);
}

function crash(s, reason) {
  s.status = 'crashed';
  s.crashReason = reason;
  s.shake = 1;
  s.events.push('crash');
}

export const CRASH_TEXT = {
  terrain: 'TERRAIN IMPACT',
  balloon: 'BROUGHT DOWN BY A BALLOON',
  'hard-landing': 'HARD LANDING — TOO FAST DOWN',
  'runway-crash': 'RUNWAY EXCURSION',
  overshoot: 'OVERSHOT THE RUNWAY',
};

// --- Pilots: pure input functions, shared by the game, the screenshots and
// the Node balance sim, so all three must agree. ---

export function idleInput() {
  return { pitch: 0, roll: 0, throttle: null, brake: false };
}

// Full throttle, aims at the next ring, never climbs for terrain, never
// flares for landing: the greedy pilot the balance test must kill.
export function greedyInput(s) {
  const ring = nextRing(s);
  const target = ring ?? { x: 0, y: CFG.runwayElev, z: 11900 };
  return aimAt(s, target, 1, false);
}

// The skilled pilot: aims at the next ring, climbs early over high ground
// ahead, and flies a proper glide slope onto runway 27.
export function autopilotInput(s) {
  // Landing mode once the last ring is behind us.
  if (s.z >= 11200 || (s.phase === 2 && !nextRing(s))) {
    const touchdownZ = 11800;
    // Aim the slope 3 m *below* the runway: the pitch damping otherwise
    // settles the aircraft into a hover ~2 m above the strip and it flies
    // past the end without ever touching down. Aiming under the surface
    // drives it through the touchdown check at a gentle ~3 m/s sink.
    const slopeY = CFG.runwayElev + Math.max(0, (touchdownZ - s.z) * 0.045) - 3;
    const target = { x: 0, y: slopeY, z: touchdownZ };
    // No flare override: the 0.045 slope already lands at ~3 m/s of sink,
    // inside the 4.5 limit, and forcing pitch up near the ground only holds
    // the aircraft off the runway until it overshoots (proven in the sim).
    return aimAt(s, target, 0.35, true, true);
  }
  const ring = nextRing(s);
  if (!ring) return { pitch: 0, roll: 0, throttle: 0.6, brake: false };
  // Terrain lookahead: sample the ground on the flight line at several
  // distances and climb over the highest of it — a single sample misses a
  // peak the aircraft is descending toward (Gate Peak, sortie 2).
  let needAlt = 0;
  for (const look of [250, 450, 650]) {
    const aheadX = s.x + Math.sin(s.heading) * look;
    const aheadZ = s.z + look;
    needAlt = Math.max(needAlt, s.terrain.heightAt(aheadX, aheadZ) + 70);
  }
  const target = { x: ring.x, y: Math.max(ring.y, needAlt), z: ring.z };
  const altErr = target.y - s.y;
  // Cruise at 0.8, climb hard when the ground demands it, ease off on the
  // final approach to a ring so the turn tightens and the line converges.
  let throttle = altErr > 60 ? 0.95 : 0.8;
  const distToRing = Math.hypot(ring.x - s.x, ring.z - s.z);
  if (distToRing < 700) throttle = Math.min(throttle, 0.65);
  return aimAt(s, target, throttle, true, true);
}

// Steer toward a 3D target: bank for the heading error, pitch for the
// altitude error (with a little damping from the current vertical speed).
// A pilot that is allowed to be agile (the skilled one, never the greedy one)
// also slows down for a hard turn, which tightens the turn radius.
function aimAt(s, target, throttle, damped, agile = false) {
  const dx = target.x - s.x;
  const dz = Math.max(40, target.z - s.z);
  const desiredHeading = Math.atan2(dx, dz);
  const headingErr = wrapAngle(desiredHeading - s.heading);
  const roll = clamp(headingErr * 2.4, -1, 1);
  if (agile && Math.abs(headingErr) > 0.45) throttle = Math.min(throttle, 0.55);
  const altErr = target.y - s.y;
  let pitch = clamp(altErr * 0.016, -1, 1);
  if (damped) pitch = clamp(pitch - s.vy * 0.02, -1, 1);
  return { pitch, roll, throttle, brake: false };
}
