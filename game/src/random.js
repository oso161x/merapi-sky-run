// MERAPI SKY RUN — deterministic random numbers.
// One file, one job: every random choice in the game comes from here, so the
// same ?seed=N always builds the same valley, the same rings, the same sky.
// Pure functions only: no Date, no Math.random, no DOM — Node can import this.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer lattice hash: stable across Node and browsers, no lookup tables.
export function hash2(ix, iz, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= seed | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Smooth value noise in [-1, 1] at world coordinates (x, z).
export function noise2(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const u = smooth(fx);
  const v = smooth(fz);
  const value = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  return value * 2 - 1;
}

// Two-octave fractal noise, still in [-1, 1] (roughly).
export function fbm2(x, z, seed) {
  return noise2(x, z, seed) * 0.65 + noise2(x * 2.13 + 7.7, z * 2.13 + 3.1, seed + 101) * 0.35;
}
