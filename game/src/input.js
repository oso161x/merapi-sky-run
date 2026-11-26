// MERAPI SKY RUN — keyboard and mouse input.
// One file, one job: turn keys and pointer movement into the { pitch, roll,
// throttle, brake } object the simulation steps with, plus edge-triggered
// actions (start, pause, restart, mute) the main loop consumes.

import { CFG } from './config.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.throttle = CFG.startThrottle;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseActive = false;
    this.mouseSeenAt = 0;
    this.actions = []; // 'start' | 'pause' | 'restart' | 'mute' | 'click'
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Enter' || e.code === 'Space') this.actions.push('start');
      if (e.code === 'KeyP' || e.code === 'Escape') this.actions.push('pause');
      if (e.code === 'KeyR') this.actions.push('restart');
      if (e.code === 'KeyM') this.actions.push('mute');
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left) / rect.width;
      this.mouseY = (e.clientY - rect.top) / rect.height;
      this.mouseActive = true;
      this.mouseSeenAt = performance.now();
    });
    canvas.addEventListener('pointerdown', () => {
      this.actions.push('start');
      this.actions.push('click');
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.throttle = Math.max(0, Math.min(1, this.throttle - Math.sign(e.deltaY) * 0.08));
    }, { passive: false });
  }

  takeActions() {
    const out = this.actions;
    this.actions = [];
    return out;
  }

  // Returns the stick input for this frame. Keyboard wins when arrows are
  // held; otherwise a recently moved mouse steers (bank toward the pointer,
  // pitch away from it). W/S nudge the throttle; Space is the airbrake.
  read(dt) {
    const k = this.keys;
    if (k.has('KeyW')) this.throttle = Math.min(1, this.throttle + dt * 0.5);
    if (k.has('KeyS')) this.throttle = Math.max(0, this.throttle - dt * 0.5);

    let pitch = 0;
    let roll = 0;
    const arrows = k.has('ArrowUp') || k.has('ArrowDown') || k.has('ArrowLeft') || k.has('ArrowRight');
    if (arrows) {
      if (k.has('ArrowUp')) pitch += 1;
      if (k.has('ArrowDown')) pitch -= 1;
      if (k.has('ArrowLeft')) roll -= 1;
      if (k.has('ArrowRight')) roll += 1;
      this.mouseActive = false;
    } else if (this.mouseActive && performance.now() - this.mouseSeenAt < 2500) {
      // Pointer steering: centre is level flight.
      roll = clamp((this.mouseX - 0.5) * 2.4, -1, 1);
      pitch = clamp((0.5 - this.mouseY) * 2.4, -1, 1);
    }
    return {
      pitch,
      roll,
      throttle: this.throttle,
      brake: k.has('Space'),
    };
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
