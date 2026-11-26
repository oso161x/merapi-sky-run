// MERAPI SKY RUN — the valley: terrain height, river, peaks, runway, rings,
// balloons, trees and clouds. One file, one job: given a seed it builds the
// whole world layout, and answers heightAt(x, z) for physics and rendering.
// Pure functions only — the Node balance sim imports this directly.

import { CFG, MISSIONS } from './config.js';
import { fbm2, hash2, mulberry32 } from './random.js';

// Named peaks: [x, z, height, radius]. Merapi watches over the whole valley;
// the Gate Peak stands on the flight line in sortie 2 and punishes any pilot
// who flies the direct line at ring height instead of climbing over it.
const PEAKS = [
  { name: 'Merapi', x: -1400, z: 4300, h: 430, r: 800 },
  { name: 'Gate Peak', x: 0, z: 6800, h: 320, r: 380 },
  { name: 'Sumbing', x: 640, z: 7600, h: 260, r: 460 },
  { name: 'Lawu', x: -520, z: 8900, h: 245, r: 420 },
  { name: 'Merbabu', x: 330, z: 2500, h: 150, r: 360 },
  { name: 'Ungaran', x: -380, z: 1500, h: 120, r: 300 },
  { name: 'Sindoro', x: 900, z: 9900, h: 200, r: 420 },
];

function smoothstep(a, b, t) {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

export function buildTerrain(seed) {
  const rng = mulberry32(seed);
  const noiseSeed = (seed * 7919 + 13) >>> 0;

  // The river winds down the valley: x as a function of z.
  function riverX(z) {
    return 260 * Math.sin(z * 0.0004 + 1.3) + 120 * Math.sin(z * 0.0011 + 0.4);
  }

  function rawHeight(x, z) {
    // Rolling farmland: gentle two-octave hills, about +/-26 m.
    let h = fbm2(x * 0.004, z * 0.004, noiseSeed) * 22 + 6;
    h += fbm2(x * 0.013 + 40, z * 0.013 + 9, noiseSeed + 7) * 6;
    // Peaks rise out of the hills as gaussian cones.
    for (const p of PEAKS) {
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      h += p.h * Math.exp(-d2 / (2 * p.r * p.r));
    }
    return h;
  }

  function heightAt(x, z) {
    let h = rawHeight(x, z);
    // Flatten the runway shelf so the strip sits on level ground.
    const dz = Math.max(0, 1 - Math.abs(z - 11900) / 900);
    const dx = Math.max(0, 1 - Math.abs(x) / 260);
    const f = smoothstep(0, 1, Math.min(1, dz * dx * 1.6));
    h = h * (1 - f) + CFG.runwayElev * f;
    return Math.max(4, h);
  }

  // Rings: one per mission anchor, laid along the valley with a steady
  // climb through sortie 2 and a descent onto the runway in sortie 3.
  const rings = [];
  let n = 0;
  const anchors = [
    // sortie 1: gentle S-curve, 140–260 m
    ...[900, 1400, 1900, 2400, 3000, 3600, 4200, 4800].map((z, i) => ({
      z,
      x: Math.sin(i * 1.15) * 150,
      y: 150 + Math.sin(i * 0.9 + 0.5) * 60 + i * 6,
    })),
    // sortie 2: wider swings, 200–340 m; ring 10 sits just behind the Gate Peak
    // (z 7300, a full 500 m past the peak, so a pilot who climbs over it has
    // room to come back down to ring height; the direct line clips the peak)
    ...[5400, 5900, 6400, 7300, 7900, 8500, 9100, 9700].map((z, i) => ({
      z,
      x: Math.cos(i * 1.05 + 0.4) * 200,
      y: 230 + Math.sin(i * 1.3) * 70 + i * 8,
    })),
    // sortie 3: descending line onto the runway threshold
    ...[10300, 10600, 10900, 11200].map((z, i) => ({
      z,
      x: Math.sin(i * 1.4) * 80 * (1 - i * 0.2),
      y: 210 - i * 48,
    })),
  ];
  for (const a of anchors) {
    const idx = n++;
    // Rings 4 and 12 are green fuel rings; the rest are gold score rings.
    const fuel = idx === 3 || idx === 11;
    rings.push({
      index: idx,
      x: a.x,
      y: a.y,
      z: a.z,
      r: CFG.ringRadius,
      type: fuel ? 'fuel' : 'gold',
      passed: false,
    });
  }

  // Balloons drift over the valley in sortie 2, near (never on) the ring line.
  const balloons = [];
  for (let i = 0; i < 7; i++) {
    const z = 5600 + i * 620 + rng() * 200;
    const side = i % 2 === 0 ? 1 : -1;
    balloons.push({
      x: side * (140 + rng() * 220),
      y: 200 + rng() * 130,
      z,
      r: 13 + rng() * 4,
      hue: rng(),
      popped: false,
    });
  }

  // Trees cluster beside the flight corridor (never on the runway shelf).
  const trees = [];
  for (let i = 0; i < 240; i++) {
    const z = 300 + rng() * 12200;
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (130 + rng() * 820);
    if (z > 11100 && z < 12700 && Math.abs(x) < 260) continue;
    trees.push({ x, y: heightAt(x, z), z, s: 0.7 + rng() * 0.9, tint: rng() });
  }

  // Clouds hang high over the valley, far above the ring line.
  const clouds = [];
  for (let i = 0; i < 42; i++) {
    clouds.push({
      x: (rng() - 0.5) * 2600,
      y: 400 + rng() * 260,
      z: 400 + rng() * 12800,
      s: 70 + rng() * 110,
      a: 0.5 + rng() * 0.4,
    });
  }

  // Field patch colour: a hash of the 180 m cell, so the patchwork is stable.
  function fieldShade(x, z) {
    const cx = Math.floor(x / 180);
    const cz = Math.floor(z / 180);
    return hash2(cx, cz, noiseSeed + 55);
  }

  return {
    seed,
    peaks: PEAKS,
    rings,
    balloons,
    trees,
    clouds,
    riverX,
    heightAt,
    rawHeight,
    fieldShade,
    runway: {
      x0: -CFG.runwayHalfWidth,
      x1: CFG.runwayHalfWidth,
      z0: CFG.runwayZ0,
      z1: CFG.runwayZ1,
      elev: CFG.runwayElev,
    },
    missions: MISSIONS,
  };
}
