// MERAPI SKY RUN — synthesised sound, no audio files.
// One file, one job: every sound the game makes is built here with WebAudio
// oscillators and filtered noise. All calls are safe before the first user
// gesture (the context resumes on input) and safe when audio is unavailable.

export class Synth {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineNodes = null;
    this.windNodes = null;
  }

  // Called on the first key/click: browsers only allow audio after a gesture.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.buildEngine();
      this.buildWind();
    } catch {
      this.ctx = null;
    }
  }

  buildEngine() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 2;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = 82.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o1.connect(filter);
    o2.connect(g2);
    g2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    o1.start();
    o2.start();
    this.engineNodes = { gain, filter, o1, o2 };
  }

  buildWind() {
    const ctx = this.ctx;
    const len = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    this.windNodes = { gain, filter };
  }

  // Continuous engine + wind, called every frame while flying.
  update(throttle, speed, flying) {
    if (!this.ctx || this.muted) {
      if (this.engineNodes) this.engineNodes.gain.gain.value = 0;
      if (this.windNodes) this.windNodes.gain.gain.value = 0;
      return;
    }
    const t = this.ctx.currentTime;
    if (this.engineNodes) {
      const e = this.engineNodes;
      const target = flying ? 0.035 + throttle * 0.05 : 0;
      e.gain.gain.setTargetAtTime(target, t, 0.1);
      e.filter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
      e.o1.frequency.setTargetAtTime(48 + throttle * 55, t, 0.1);
      e.o2.frequency.setTargetAtTime(72 + throttle * 82, t, 0.1);
    }
    if (this.windNodes) {
      const w = this.windNodes;
      const target = flying ? Math.max(0, (speed - 55) / 90) * 0.05 : 0;
      w.gain.gain.setTargetAtTime(target, t, 0.15);
      w.filter.frequency.setTargetAtTime(400 + speed * 6, t, 0.15);
    }
  }

  tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const ctx = this.ctx;
      const t0 = ctx.currentTime + when;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  noiseBurst(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    try {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start();
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  ring() {
    this.tone(880, 0.18, 'sine', 0.16);
    this.tone(1318, 0.28, 'sine', 0.12, 0.07);
  }

  fuelRing() {
    this.tone(660, 0.15, 'sine', 0.15);
    this.tone(990, 0.15, 'sine', 0.15, 0.08);
    this.tone(1320, 0.3, 'sine', 0.12, 0.16);
  }

  hit() {
    this.noiseBurst(0.25, 0.3, 900);
    this.tone(110, 0.3, 'square', 0.12, 0, 55);
  }

  crash() {
    this.noiseBurst(0.9, 0.5, 500);
    this.tone(90, 0.9, 'sawtooth', 0.18, 0, 30);
  }

  land() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.14, i * 0.11));
  }

  click() {
    this.tone(1200, 0.06, 'sine', 0.08);
  }

  phase() {
    this.tone(440, 0.2, 'triangle', 0.1);
    this.tone(587, 0.3, 'triangle', 0.1, 0.1);
  }
}
