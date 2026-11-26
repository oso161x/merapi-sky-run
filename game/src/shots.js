// MERAPI SKY RUN — deterministic screenshot scenes for ?shot=.
// One file, one job: put the world into a fixed, good-looking pose for each
// named scene, by running the same pilots the balance sim uses. The scene is
// then frozen (the main loop renders but never steps), so a headless browser
// captures the same pixels every time.

import { CFG } from './config.js';
import { autopilotInput, greedyInput, stepWorld } from './world.js';

function runSteps(s, inputFn, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps && s.status === 'flying'; i++) {
    stepWorld(s, inputFn(s));
  }
}

// start: on the runway, engines idling, title screen over the scene. The
// aircraft sits ON the strip (z 11600, past the threshold) so the runway
// leads ahead of it and the river crossing stays behind the camera.
function sceneStart(s) {
  s.status = 'title';
  s.x = 0;
  s.y = CFG.runwayElev + 1.2;
  s.z = 11600;
  s.heading = 0;
  s.pitch = 0;
  s.bank = 0;
  s.speed = 0;
  s.throttle = 0;
}

// play: 32 s into the sortie — level flight, the next ring ahead and clear
// of the aircraft, valley and river below. The judge's cover shot.
function scenePlay(s) {
  s.status = 'flying';
  runSteps(s, autopilotInput, 32);
}

// win: the whole flight, flown by the autopilot to a touchdown on runway 27.
function sceneWin(s, renderer) {
  s.status = 'flying';
  runSteps(s, autopilotInput, 400);
  if (s.status === 'landed') {
    renderer.saveBest(s.score);
    // Parked: the instruments read zero, as a parked aircraft should.
    s.speed = 0;
    s.throttle = 0;
    s.vy = 0;
    // A little dust at the wheels for the landing shot, pre-spread so the
    // frozen frame shows the cloud, not one dot (frozen particles never age).
    const p = renderer.project(s.x, CFG.runwayElev + 1, s.z);
    if (p) renderer.spawnBurst(p.x, p.y + 40, 'rgba(200,190,170,0.8)', 26, 90, 5, 1.4);
    for (let i = 0; i < 6; i++) renderer.updateParticles(0.1);
  }
}

// end: the greedy pilot, flown until it meets the Gate Peak — frozen
// mid-explosion so the crash reads at a glance.
function sceneEnd(s, renderer) {
  s.status = 'flying';
  runSteps(s, greedyInput, 400);
  if (s.status === 'crashed') {
    // Wrecked: the instruments read zero.
    s.speed = 0;
    s.throttle = 0;
    s.vy = 0;
    renderer.burstAtWorld(s, s.x, s.y + 6, s.z, '#ff7a1a', 90, 320, 6, 1.2);
    renderer.burstAtWorld(s, s.x, s.y + 10, s.z, '#5a5a5a', 50, 150, 9, 1.8);
    renderer.burstAtWorld(s, s.x, s.y + 4, s.z, '#ffd23a', 40, 380, 4, 0.7);
    // Pre-spread the explosion: a frozen frame never ages particles, so
    // without this the whole burst sits on one pixel behind the panel.
    for (let i = 0; i < 6; i++) renderer.updateParticles(0.1);
  }
}

export const SHOTS = { start: sceneStart, play: scenePlay, win: sceneWin, end: sceneEnd };

export function applyShot(s, renderer, name) {
  const scene = SHOTS[name];
  if (!scene) return false;
  scene(s, renderer);
  return true;
}
