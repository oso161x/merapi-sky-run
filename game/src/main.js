// MERAPI SKY RUN — boot and game loop.
// One file, one job: own the canvas, the state machine (title / flying /
// paused / landed / crashed), the fixed-step simulation, the sound events and
// the ?seed= / ?shot= URL parameters. The simulation itself lives in world.js.

import { CFG } from './config.js';
import { createWorld, stepWorld } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Synth } from './audio.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 7) || 7;
const shotName = params.get('shot') || '';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = CFG.viewWidth * dpr;
  canvas.height = CFG.viewHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

let world = createWorld(seed);
const renderer = new Renderer(canvas, seed);
const input = new Input(canvas);
const synth = new Synth();

let frozen = false;
let pausedFrom = null;

if (shotName) {
  frozen = applyShot(world, renderer, shotName);
  if (frozen) {
    // A frozen scene renders but never advances: the screenshot is the same
    // pixels on every run.
    renderer.render(world, 0, true);
  }
}

// Debug handle for headless verification: window.__game.status/score/seed.
window.__game = {
  get status() {
    return world.status;
  },
  get score() {
    return world.score;
  },
  get rings() {
    return world.ringsPassed;
  },
  get seed() {
    return seed;
  },
  get shot() {
    return shotName;
  },
};

function restart() {
  world = createWorld(seed);
  input.throttle = CFG.startThrottle;
  renderer.particles = [];
  renderer.time = 0;
  pausedFrom = null;
}

function drainEvents() {
  for (const e of world.events) {
    if (e === 'ring') {
      synth.ring();
      const ring = world.terrain.rings[world.ringsPassed - 1];
      if (ring) renderer.burstAtWorld(world, ring.x, ring.y, ring.z, '#f5b301', 34, 190, 4, 0.8);
    } else if (e === 'fuel-ring') {
      synth.fuelRing();
      const ring = world.terrain.rings[world.ringsPassed - 1];
      if (ring) renderer.burstAtWorld(world, ring.x, ring.y, ring.z, '#39d353', 34, 190, 4, 0.8);
    } else if (e === 'hit') {
      synth.hit();
      renderer.burstAtWorld(world, world.x, world.y, world.z, '#ff6b5e', 26, 200, 5, 0.7);
    } else if (e === 'crash') {
      synth.crash();
      renderer.burstAtWorld(world, world.x, world.y + 4, world.z, '#ff7a1a', 80, 260, 6, 1.2);
      renderer.burstAtWorld(world, world.x, world.y + 8, world.z, '#5a5a5a', 44, 120, 9, 1.8);
      renderer.saveBest(world.score);
    } else if (e === 'land') {
      synth.land();
      renderer.saveBest(world.score);
    } else if (e === 'phase') {
      synth.phase();
    } else if (e === 'fuel-empty') {
      synth.hit();
    }
  }
  world.events.length = 0;
}

function setStatusLine() {
  const text =
    world.status === 'title'
      ? 'Merapi Sky Run. Press Enter or click to fly.'
      : world.status === 'flying'
        ? `Flying. Score ${world.score}. Rings ${world.ringsPassed} of ${world.ringsTotal}. Fuel ${Math.round(world.fuel)} percent.`
        : world.status === 'landed'
          ? `Landed on runway 27. Score ${world.score}.`
          : world.status === 'crashed'
            ? `Crashed. Score ${world.score}.`
            : 'Paused.';
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

let last = performance.now();
let accumulator = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  for (const action of input.takeActions()) {
    synth.ensure();
    if (action === 'start' && world.status === 'title') {
      synth.click();
      world.status = 'flying';
    } else if (action === 'start' && (world.status === 'landed' || world.status === 'crashed')) {
      // Clicking the end panel does nothing: R restarts, so a stray click
      // cannot throw away the result screen.
    } else if (action === 'pause' && world.status === 'flying') {
      pausedFrom = 'flying';
      world.status = 'paused';
    } else if (action === 'pause' && world.status === 'paused') {
      world.status = pausedFrom || 'flying';
    } else if (action === 'restart') {
      synth.click();
      restart();
    } else if (action === 'mute') {
      synth.muted = !synth.muted;
    }
  }

  if (!frozen && world.status === 'flying') {
    accumulator += dt;
    let n = 0;
    while (accumulator >= STEP && n < 5) {
      stepWorld(world, input.read(STEP), STEP);
      accumulator -= STEP;
      n += 1;
      if (world.status !== 'flying') break;
    }
    if (n === 5) accumulator = 0;
    drainEvents();
    // Engine exhaust: two faint puffs a frame from the nozzles.
    if (world.throttle > 0.15 && Math.random() < 0.7) {
      const px = CFG.viewWidth / 2 + (Math.random() < 0.5 ? -15 : 15);
      renderer.particles.push({
        x: px + (Math.random() - 0.5) * 6,
        y: CFG.viewHeight * 0.6 + 62,
        vx: (Math.random() - 0.5) * 20,
        vy: 40 + Math.random() * 40,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.3,
        size: 2 + Math.random() * 2,
        color: 'rgba(200,210,220,0.5)',
      });
    }
  } else if (!frozen && world.status !== 'flying') {
    drainEvents();
  }

  synth.update(
    world.status === 'flying' ? world.throttle : 0,
    world.status === 'flying' ? world.speed : 0,
    world.status === 'flying',
  );
  renderer.render(world, frozen ? 0 : dt, frozen);
  setStatusLine();
}

if (!frozen) requestAnimationFrame(frame);
