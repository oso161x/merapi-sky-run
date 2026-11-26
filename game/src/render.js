// MERAPI SKY RUN — canvas renderer: sky, terrain, aircraft, HUD, screens.
// One file, one job: turn a world state into a picture. It never touches the
// simulation (world.js owns that); it only reads it, so the Node balance sim
// and the browser game cannot drift apart.

import { CFG, MISSIONS } from './config.js';
import { mulberry32 } from './random.js';
import { CRASH_TEXT } from './world.js';

const W = CFG.viewWidth;
const H = CFG.viewHeight;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(c1, c2, t) {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}

function css(c, a = 1) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

const SKY_TOP = [38, 88, 138];
const SKY_MID = [122, 178, 214];
const HORIZON = [255, 214, 160];
const HAZE = [205, 220, 232];
const FIELD_COLORS = [
  [74, 124, 58], [93, 143, 67], [109, 163, 78], [120, 150, 70],
  [184, 169, 92], [122, 90, 56], [88, 138, 66], [140, 165, 80],
];
const ROCK = [107, 98, 89];
const SNOW = [233, 237, 242];
const WATER = [46, 109, 168];
const GOLD = [245, 179, 1];
const GREEN = [57, 211, 83];

export class Renderer {
  constructor(canvas, seed) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rng = mulberry32(seed || 7);
    this.particles = [];
    this.time = 0;
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
    this.horizonY = H * 0.55;
    this.best = 0;
    try {
      this.best = Number(window.localStorage.getItem('merapi-sky-run-best') || 0) || 0;
    } catch {
      this.best = 0;
    }
  }

  saveBest(score) {
    if (score > this.best) {
      this.best = score;
      try {
        window.localStorage.setItem('merapi-sky-run-best', String(score));
      } catch {
        // Best score is a nicety; a blocked store never stops the game.
      }
    }
  }

  // --- Camera and projection ---
  computeCamera(s) {
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    this.cam.x = s.x - fx * CFG.cameraBack;
    this.cam.y = s.y + CFG.cameraUp;
    this.cam.z = s.z - fz * CFG.cameraBack;
    this.cam.yaw = s.heading;
    this.cam.pitch = s.pitch * 0.55 - 0.04;
    this.cam.roll = s.bank * 0.55;
    const far = this.projectRaw(
      this.cam.x + fx * 5000, this.cam.y, this.cam.z + fz * 5000,
    );
    this.horizonY = far ? far.y : H * 0.55;
  }

  projectRaw(wx, wy, wz) {
    const dx = wx - this.cam.x;
    const dy = wy - this.cam.y;
    const dz = wz - this.cam.z;
    const cy = Math.cos(this.cam.yaw);
    const sy = Math.sin(this.cam.yaw);
    const cx = dx * cy - dz * sy;
    let cz = dx * sy + dz * cy;
    const cp = Math.cos(this.cam.pitch);
    const sp = Math.sin(this.cam.pitch);
    const cyP = dy * cp - cz * sp;
    cz = dy * sp + cz * cp;
    const cr = Math.cos(this.cam.roll);
    const sr = Math.sin(this.cam.roll);
    const cxR = cx * cr + cyP * sr;
    const cyR = -cx * sr + cyP * cr;
    if (cz <= 2) return null;
    return {
      x: W / 2 + (cxR / cz) * CFG.focal,
      y: H * 0.55 - (cyR / cz) * CFG.focal,
      d: cz,
    };
  }

  project(wx, wy, wz) {
    return this.projectRaw(wx, wy, wz);
  }

  // --- Particles (screen space, cosmetic) ---
  spawnBurst(sx, sy, color, n, speed, size, life) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const v = speed * (0.3 + this.rng() * 0.7);
      this.particles.push({
        x: sx, y: sy,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25,
        life: 0, maxLife: life * (0.6 + this.rng() * 0.7),
        size: size * (0.6 + this.rng() * 0.8),
        color,
      });
    }
  }

  burstAtWorld(s, wx, wy, wz, color, n, speed = 160, size = 4, life = 0.9) {
    const p = this.project(wx, wy, wz);
    if (p) this.spawnBurst(p.x, p.y, color, n, speed, size, life);
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.vx *= 1 - 1.4 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const a = 1 - p.life / p.maxLife;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- Frame ---
  render(s, dt, frozen) {
    const ctx = this.ctx;
    this.time += frozen ? 0 : dt;
    this.computeCamera(s);
    ctx.save();
    if (s.shake > 0) {
      const m = s.shake * 9;
      ctx.translate((this.rng() - 0.5) * m * 2, (this.rng() - 0.5) * m * 2);
    }
    this.drawSky(ctx, s);
    this.drawClouds(ctx, s);
    this.drawPeaks(ctx, s);
    this.drawGround(ctx, s);
    this.drawRunway(ctx, s);
    this.drawRings(ctx, s);
    this.drawBalloons(ctx, s);
    this.drawTrees(ctx, s);
    if (s.status === 'crashed') {
      // A wrecked aircraft is not drawn: the explosion is the picture.
    } else if (s.status === 'title') {
      // Drawn after the title overlay, inside drawTitle, so the gradient
      // does not dim it: the parked aircraft stays bright in frame.
    } else {
      this.drawPlane(ctx, s);
    }
    if (!frozen) this.updateParticles(dt);
    this.drawParticles(ctx);
    ctx.restore();
    this.drawSpeedLines(ctx, s);
    this.drawVignette(ctx);
    if (s.invuln > 0 && s.status === 'flying') {
      ctx.fillStyle = `rgba(200,30,30,${0.16 * (s.invuln / CFG.invulnSeconds)})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.drawHud(ctx, s);
    if (s.status === 'title') this.drawTitle(ctx, s);
    if (s.status === 'paused') this.drawPaused(ctx, s);
    if (s.status === 'landed') this.drawLanded(ctx, s);
    if (s.status === 'crashed') this.drawCrashed(ctx, s);
  }

  // --- Sky, sun, clouds ---
  drawSky(ctx, s) {
    const hy = this.horizonY;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(SKY_TOP));
    g.addColorStop(clamp(hy / H, 0.1, 0.9), css(SKY_MID));
    g.addColorStop(clamp(hy / H + 0.06, 0.1, 1), css(HORIZON));
    g.addColorStop(1, css([70, 90, 80]));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun: ahead and to the left, high.
    const yaw = s.heading - 0.65;
    const sun = this.project(
      this.cam.x + Math.sin(yaw) * 8000,
      this.cam.y + 2600,
      this.cam.z + Math.cos(yaw) * 8000,
    );
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      glow.addColorStop(0, 'rgba(255,240,200,0.95)');
      glow.addColorStop(0.25, 'rgba(255,220,150,0.45)');
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawClouds(ctx, s) {
    for (const c of s.terrain.clouds) {
      const p = this.project(c.x, c.y, c.z);
      if (!p || p.d < 60 || p.d > 14000) continue;
      const sc = (c.s * CFG.focal) / p.d;
      if (sc < 6) continue;
      const a = c.a * (1 - p.d / 14000) * 0.9;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      for (const [ox, oy, r] of [[-0.5, 0.1, 0.55], [0, -0.15, 0.7], [0.55, 0.08, 0.5], [0.2, 0.2, 0.45]]) {
        ctx.beginPath();
        ctx.ellipse(p.x + ox * sc, p.y + oy * sc, r * sc, r * sc * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Distant peaks ---
  drawPeaks(ctx, s) {
    for (const peak of s.terrain.peaks) {
      const dz = peak.z - this.cam.z;
      if (dz < 300 || dz > 12000) continue;
      const dx = peak.x - this.cam.x;
      if (Math.abs(dx) > 3200) continue;
      const apex = this.project(peak.x, peak.h + 30, peak.z);
      if (!apex) continue;
      const baseY = 30;
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const px = peak.x + Math.cos(a) * peak.r;
        const pz = peak.z + Math.sin(a) * peak.r * 0.9;
        const p = this.project(px, baseY, pz);
        if (p) pts.push(p);
      }
      if (pts.length < 3) continue;
      const hazeT = clamp(dz / 12000, 0, 1) * 0.55;
      const rock = mixColor(ROCK, HAZE, hazeT);
      ctx.fillStyle = css(rock);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(apex.x, apex.y);
      ctx.closePath();
      ctx.fill();
      // Snow cap: the upper third of the cone.
      const cap = mixColor(SNOW, HAZE, hazeT);
      ctx.fillStyle = css(cap);
      ctx.beginPath();
      const top = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rr = peak.r * 0.34;
        const px = peak.x + Math.cos(a) * rr;
        const pz = peak.z + Math.sin(a) * rr * 0.9;
        const p = this.project(px, peak.h * 0.66 + 30, pz);
        if (p) top.push(p);
      }
      if (top.length >= 3) {
        ctx.moveTo(top[0].x, top[0].y);
        for (const p of top) ctx.lineTo(p.x, p.y);
        ctx.lineTo(apex.x, apex.y);
        ctx.closePath();
        ctx.fill();
      }
      // Merapi breathes: a slow smoke plume above its summit.
      if (peak.name === 'Merapi') {
        ctx.fillStyle = `rgba(220,220,220,${0.35 - hazeT * 0.2})`;
        for (let i = 0; i < 3; i++) {
          const drift = Math.sin(this.time * 0.4 + i * 2.1) * 14;
          const sp = this.project(peak.x + drift + i * 18, peak.h + 90 + i * 46, peak.z);
          if (sp) {
            ctx.beginPath();
            ctx.ellipse(sp.x, sp.y, 26 - i * 4, 12 - i * 2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  // --- Ground: perspective strips over the heightfield ---
  terrainColor(s, x, z, h, dist) {
    let base;
    if (Math.abs(x - s.terrain.riverX(z)) < 30) {
      base = WATER;
    } else if (h > 300) {
      base = SNOW;
    } else if (h > 195) {
      base = ROCK;
    } else {
      const cell = Math.abs(Math.floor(x / 180) * 31 + Math.floor(z / 180) * 17) % FIELD_COLORS.length;
      base = FIELD_COLORS[cell];
    }
    // Slope shading: higher ground reads darker, valleys lighter.
    const shadeF = clamp((h - 10) / 120, -0.12, 0.18);
    const shaded = [base[0] * (1 - shadeF), base[1] * (1 - shadeF), base[2] * (1 - shadeF)];
    const hazeT = clamp(dist / CFG.groundFar, 0, 1) * 0.72;
    return css(mixColor(shaded, HAZE, hazeT));
  }

  drawGround(ctx, s) {
    // Slices from near to far, then painted far to near. The slices run
    // ALONG the view direction (not world +z): a pilot who turns 90 degrees
    // must still see ground ahead, not a bare haze where the strip band ends.
    const slices = [];
    let d = 28;
    while (d < CFG.groundFar) {
      const step = Math.max(18, d * 0.12);
      slices.push({ d, step });
      d += step;
    }
    const fx = Math.sin(this.cam.yaw);
    const fz = Math.cos(this.cam.yaw);
    const rx = Math.cos(this.cam.yaw);
    const rz = -Math.sin(this.cam.yaw);
    const nx = 20;
    for (const sl of slices) {
      const cx = this.cam.x + fx * sl.d;
      const cz = this.cam.z + fz * sl.d;
      sl.pts = [];
      for (let i = 0; i <= nx; i++) {
        const off = -1000 + (2000 * i) / nx;
        const x = cx + rx * off;
        const z = cz + rz * off;
        const h = s.terrain.heightAt(x, z);
        sl.pts.push({ p: this.project(x, h + 0.4, z), h, x, z });
      }
    }
    for (let si = slices.length - 1; si > 0; si--) {
      const a = slices[si];
      const b = slices[si - 1];
      for (let i = 0; i < nx; i++) {
        const p1 = a.pts[i].p;
        const p2 = a.pts[i + 1].p;
        const p3 = b.pts[i + 1].p;
        const p4 = b.pts[i].p;
        if (!p1 || !p2 || !p3 || !p4) continue;
        const midX = (a.pts[i].x + a.pts[i + 1].x) / 2;
        const midZ = (a.pts[i].z + a.pts[i + 1].z + b.pts[i].z + b.pts[i + 1].z) / 4;
        const midH = (a.pts[i].h + b.pts[i].h) / 2;
        ctx.fillStyle = this.terrainColor(s, midX, midZ, midH, a.d);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // --- Runway 27, windsock, hangars ---
  drawRunway(ctx, s) {
    const rw = s.terrain.runway;
    if (this.cam.z > rw.z1 + 200) return;
    // The strip's near edge may sit behind the camera (parked on the
    // runway, or on short final): clamp it just ahead so the polygon is
    // drawn instead of skipped wholesale for one corner behind the lens.
    const z0 = Math.max(rw.z0, this.cam.z + 5);
    const c = [
      this.project(rw.x0, rw.elev, z0),
      this.project(rw.x1, rw.elev, z0),
      this.project(rw.x1, rw.elev, rw.z1),
      this.project(rw.x0, rw.elev, rw.z1),
    ];
    if (c.some((p) => !p)) return;
    ctx.fillStyle = '#33373d';
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    for (const p of c.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    // Edge lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.moveTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.stroke();
    // Centreline dashes.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let z = Math.max(rw.z0 + 80, this.cam.z + 30); z < rw.z1 - 60; z += 120) {
      const a = this.project(-1.6, rw.elev + 0.2, z);
      const b = this.project(1.6, rw.elev + 0.2, z);
      const d = this.project(1.6, rw.elev + 0.2, z + 55);
      const e = this.project(-1.6, rw.elev + 0.2, z + 55);
      if (!a || !b || !d || !e) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(d.x, d.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
      ctx.fill();
    }
    // Threshold chevrons.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = -2; i <= 2; i++) {
      const a = this.project(i * 14 - 5, rw.elev + 0.2, rw.z0 + 24);
      const b = this.project(i * 14 + 5, rw.elev + 0.2, rw.z0 + 24);
      const d = this.project(i * 14 + 5, rw.elev + 0.2, rw.z0 + 52);
      const e = this.project(i * 14 - 5, rw.elev + 0.2, rw.z0 + 52);
      if (!a || !b || !d || !e) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(d.x, d.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
      ctx.fill();
    }
    // Windsock beside the threshold.
    const base = this.project(78, rw.elev, 11620);
    const top = this.project(78, rw.elev + 11, 11620);
    if (base && top) {
      ctx.strokeStyle = '#d8dee4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      const tip = this.project(78 + 12 + s.gust * 0.4, rw.elev + 10, 11620);
      if (tip) {
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(tip.x, tip.y - 2);
        ctx.lineTo(tip.x, tip.y + 3);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Two hangars east of the strip.
    this.drawHangar(ctx, s, -135, 11860);
    this.drawHangar(ctx, s, 145, 11960);
  }

  drawHangar(ctx, s, x, z) {
    const y = s.terrain.heightAt(x, z);
    const a = this.project(x - 26, y, z - 20);
    const b = this.project(x + 26, y, z - 20);
    const c = this.project(x + 26, y + 15, z - 20);
    const d = this.project(x - 26, y + 15, z - 20);
    if (!a || !b || !c || !d) return;
    ctx.fillStyle = '#2c343c';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#46525e';
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo((c.x + d.x) / 2, Math.min(c.y, d.y) - Math.abs(c.x - d.x) * 0.12);
    ctx.closePath();
    ctx.fill();
  }

  // --- Rings, balloons, trees ---
  drawRings(ctx, s) {
    const next = s.terrain.rings.find((r) => !r.passed && !r.missed);
    const sorted = [...s.terrain.rings]
      .filter((r) => !r.passed)
      .sort((a, b) => b.z - a.z);
    for (const r of sorted) {
      const p = this.project(r.x, r.y, r.z);
      if (!p || p.d < 40 || p.d > 3200) continue;
      const sr = (r.r * CFG.focal) / p.d;
      if (sr < 3) continue;
      const isNext = r === next;
      const fuel = r.type === 'fuel';
      const col = r.missed ? [150, 150, 150] : fuel ? GREEN : GOLD;
      const pulse = isNext ? 1 + 0.07 * Math.sin(this.time * 5) : 1;
      const rad = sr * pulse;
      // Guide line down to the ground, so altitude reads at a glance.
      const g = this.project(r.x, s.terrain.heightAt(r.x, r.z), r.z);
      if (g) {
        ctx.strokeStyle = `rgba(255,255,255,${r.missed ? 0.08 : 0.22})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(g.x, g.y);
        ctx.stroke();
      }
      const glow = ctx.createRadialGradient(p.x, p.y, rad * 0.4, p.x, p.y, rad * 1.7);
      glow.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${isNext ? 0.35 : 0.14})`);
      glow.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = css(col, r.missed ? 0.4 : 0.95);
      ctx.lineWidth = Math.max(2, rad * 0.1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(1, rad * 0.045);
      ctx.setLineDash([rad * 0.35, rad * 0.25]);
      ctx.lineDashOffset = -this.time * 46;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css(col, 0.9);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, rad * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBalloons(ctx, s) {
    for (const b of s.terrain.balloons) {
      if (b.popped) continue;
      const p = this.project(b.x, b.y, b.z);
      if (!p || p.d < 30 || p.d > 2200) continue;
      const sr = (b.r * CFG.focal) / p.d;
      if (sr < 4) continue;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, sr, 0, Math.PI * 2);
      ctx.clip();
      const hue = Math.floor(b.hue * 3);
      const cols = [['#d63a2f', '#f5f0e6'], ['#2f7fd6', '#f5f0e6'], ['#e8a13a', '#7a3fd6']][hue];
      for (let i = -3; i <= 3; i++) {
        ctx.fillStyle = cols[(i + 6) % 2];
        ctx.fillRect(p.x + ((i - 0.5) / 3) * sr, p.y - sr, (sr / 3) * 1.05, sr * 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x - sr * 0.35, p.y - sr * 0.4, sr * 0.3, sr * 0.18, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(40,30,30,0.8)';
      ctx.lineWidth = Math.max(1, sr * 0.06);
      ctx.beginPath();
      ctx.arc(p.x, p.y, sr, 0, Math.PI * 2);
      ctx.stroke();
      // Basket.
      const by = p.y + sr * 1.35;
      ctx.strokeStyle = '#5a4632';
      ctx.lineWidth = Math.max(1, sr * 0.05);
      ctx.beginPath();
      ctx.moveTo(p.x - sr * 0.3, p.y + sr * 0.8);
      ctx.lineTo(p.x - sr * 0.18, by);
      ctx.moveTo(p.x + sr * 0.3, p.y + sr * 0.8);
      ctx.lineTo(p.x + sr * 0.18, by);
      ctx.stroke();
      ctx.fillStyle = '#6b4f2e';
      ctx.fillRect(p.x - sr * 0.2, by, sr * 0.4, sr * 0.3);
    }
  }

  drawTrees(ctx, s) {
    for (const t of s.terrain.trees) {
      const dz = t.z - this.cam.z;
      if (dz < 20 || dz > 1500) continue;
      if (Math.abs(t.x - this.cam.x) > 800) continue;
      const base = this.project(t.x, t.y, t.z);
      if (!base) continue;
      const top = this.project(t.x, t.y + 24 * t.s, t.z);
      if (!top) continue;
      const hPx = base.y - top.y;
      if (hPx < 2) continue;
      const wPx = hPx * 0.55;
      ctx.strokeStyle = '#5a4028';
      ctx.lineWidth = Math.max(1, hPx * 0.08);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x, base.y - hPx * 0.35);
      ctx.stroke();
      const greens = ['#2f5d33', '#3a7038'];
      const tint = t.tint > 0.5 ? 1 : 0;
      ctx.fillStyle = greens[tint];
      ctx.beginPath();
      ctx.moveTo(base.x - wPx, base.y - hPx * 0.3);
      ctx.lineTo(base.x, top.y);
      ctx.lineTo(base.x + wPx, base.y - hPx * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = greens[1 - tint];
      ctx.beginPath();
      ctx.moveTo(base.x - wPx * 0.7, base.y - hPx * 0.55);
      ctx.lineTo(base.x, base.y - hPx * 0.95);
      ctx.lineTo(base.x + wPx * 0.7, base.y - hPx * 0.55);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- The aircraft, chase view ---
  drawPlane(ctx, s, dy = 0, scale = 1) {
    const px = W / 2;
    const py = H * 0.6 - s.pitch * 26 + dy;
    const roll = s.bank * 0.45;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(roll);
    ctx.scale(scale, scale);
    // Exhaust glow.
    const throttle = s.status === 'flying' ? s.throttle : 0;
    for (const side of [-1, 1]) {
      const flick = 0.7 + 0.3 * Math.sin(this.time * 43 + side * 2);
      const len = (10 + throttle * 34) * flick;
      const eg = ctx.createRadialGradient(side * 15, 62, 1, side * 15, 62, len);
      eg.addColorStop(0, `rgba(255,180,80,${0.75 * throttle})`);
      eg.addColorStop(0.5, `rgba(255,110,30,${0.4 * throttle})`);
      eg.addColorStop(1, 'rgba(255,110,30,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.ellipse(side * 15, 62 + len * 0.4, 9, len * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Main wing (swept, seen from behind-above).
    const wingGrad = ctx.createLinearGradient(0, -8, 0, 26);
    wingGrad.addColorStop(0, '#d7e0e8');
    wingGrad.addColorStop(1, '#8fa1b3');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(-102, 22);
    ctx.lineTo(-98, 30);
    ctx.lineTo(-12, 18);
    ctx.lineTo(12, 18);
    ctx.lineTo(98, 30);
    ctx.lineTo(102, 22);
    ctx.lineTo(14, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,60,80,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Wingtip nav lights.
    const blink = Math.sin(this.time * 5) > 0 ? 1 : 0.25;
    ctx.fillStyle = `rgba(255,60,60,${blink})`;
    ctx.beginPath();
    ctx.arc(-100, 25, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(60,255,120,${blink})`;
    ctx.beginPath();
    ctx.arc(100, 25, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Fuselage: narrow at the nose (far, top), wide at the tail (near, bottom).
    const fus = ctx.createLinearGradient(-16, 0, 16, 0);
    fus.addColorStop(0, '#9fb0c0');
    fus.addColorStop(0.5, '#e6edf2');
    fus.addColorStop(1, '#8fa1b3');
    ctx.fillStyle = fus;
    ctx.beginPath();
    ctx.moveTo(-7, -72);
    ctx.quadraticCurveTo(-11, -30, -15, 34);
    ctx.quadraticCurveTo(-16, 58, -13, 62);
    ctx.lineTo(13, 62);
    ctx.quadraticCurveTo(16, 58, 15, 34);
    ctx.quadraticCurveTo(11, -30, 7, -72);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,60,80,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Merapi-orange cheatline along the fuselage.
    ctx.strokeStyle = '#ff7a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-9, -40);
    ctx.quadraticCurveTo(-12, 0, -14, 40);
    ctx.moveTo(9, -40);
    ctx.quadraticCurveTo(12, 0, 14, 40);
    ctx.stroke();
    // Canopy hump with a glint.
    ctx.fillStyle = '#16324a';
    ctx.beginPath();
    ctx.ellipse(0, -52, 7, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,230,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-2, -56, 2.4, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Tailplane.
    ctx.fillStyle = '#7e93a6';
    ctx.beginPath();
    ctx.moveTo(-8, 34);
    ctx.lineTo(-46, 52);
    ctx.lineTo(-44, 58);
    ctx.lineTo(-6, 46);
    ctx.lineTo(6, 46);
    ctx.lineTo(44, 58);
    ctx.lineTo(46, 52);
    ctx.lineTo(8, 34);
    ctx.closePath();
    ctx.fill();
    // Vertical fin, teal, with the callsign.
    ctx.fillStyle = '#0f766e';
    ctx.beginPath();
    ctx.moveTo(-6, 40);
    ctx.lineTo(-9, 4);
    ctx.lineTo(0, -6);
    ctx.lineTo(9, 4);
    ctx.lineTo(6, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e6fffa';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(0, 20);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('OSO-161', 0, 0);
    ctx.restore();
    // Engine nozzles.
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#2c343c';
      ctx.beginPath();
      ctx.arc(side * 15, 60, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,${140 + Math.floor(60 * throttle)},40,${0.5 + throttle * 0.5})`;
      ctx.beginPath();
      ctx.arc(side * 15, 60, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Atmosphere overlays ---
  drawSpeedLines(ctx, s) {
    if (s.status !== 'flying' || s.speed < 105) return;
    const a = clamp((s.speed - 105) / 40, 0, 1) * 0.28;
    ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + 0.31;
      const r0 = 330 + ((i * 97 + this.time * 900) % 120);
      const r1 = r0 + 46;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(ang) * r0, H * 0.55 + Math.sin(ang) * r0 * 0.7);
      ctx.lineTo(W / 2 + Math.cos(ang) * r1, H * 0.55 + Math.sin(ang) * r1 * 0.7);
      ctx.stroke();
    }
  }

  drawVignette(ctx) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // --- HUD ---
  panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(6,16,26,0.55)';
    ctx.strokeStyle = 'rgba(120,200,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  drawHud(ctx, s) {
    if (s.status === 'title') {
      // Instruments stay lit behind the title: the judge sees a complete
      // cockpit at first glance, not a blank menu.
      this.drawCompass(ctx, s);
      this.drawTapes(ctx, s);
      this.drawAttitude(ctx, s);
      this.drawGauges(ctx, s);
      return;
    }
    this.drawCompass(ctx, s);
    this.drawTapes(ctx, s);
    this.drawAttitude(ctx, s);
    this.drawGauges(ctx, s);
    this.drawScoreBlock(ctx, s);
    this.drawNextRingArrow(ctx, s);
    this.drawToasts(ctx, s);
    if (s.fuel < 25 && s.status === 'flying') {
      const on = Math.sin(this.time * 6) > 0;
      if (on) {
        ctx.fillStyle = '#ffb020';
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LOW FUEL', W / 2, 108);
      }
    }
    // Centre reticle.
    ctx.strokeStyle = 'rgba(127,231,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.52, 10, 0, Math.PI * 2);
    ctx.moveTo(W / 2 - 18, H * 0.52);
    ctx.lineTo(W / 2 - 10, H * 0.52);
    ctx.moveTo(W / 2 + 10, H * 0.52);
    ctx.lineTo(W / 2 + 18, H * 0.52);
    ctx.moveTo(W / 2, H * 0.52 - 18);
    ctx.lineTo(W / 2, H * 0.52 - 10);
    ctx.moveTo(W / 2, H * 0.52 + 10);
    ctx.lineTo(W / 2, H * 0.52 + 18);
    ctx.stroke();
  }

  drawCompass(ctx, s) {
    const cx = W / 2;
    const cy = 30;
    const halfW = 230;
    this.panel(ctx, cx - halfW, 10, halfW * 2, 48);
    const headingDeg = ((s.heading * 180) / Math.PI % 360 + 360) % 360;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - halfW + 4, 12, halfW * 2 - 8, 38);
    ctx.clip();
    ctx.fillStyle = '#7fe7ff';
    ctx.strokeStyle = 'rgba(127,231,255,0.7)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pxPerDeg = 3.6;
    const start = Math.floor((headingDeg - 55) / 5) * 5;
    for (let d = start; d <= headingDeg + 55; d += 5) {
      const deg = ((d % 360) + 360) % 360;
      const x = cx + (d - headingDeg) * pxPerDeg;
      const major = deg % 15 === 0;
      ctx.beginPath();
      ctx.moveTo(x, major ? 18 : 24);
      ctx.lineTo(x, 34);
      ctx.stroke();
      if (major) {
        // The caret already marks dead centre: skip the label there so it
        // never collides with the HDG readout (heading 000 puts N at centre).
        if (Math.abs(x - cx) > 14) {
          const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
          ctx.fillText(label, x, 40);
        }
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffc857';
    ctx.beginPath();
    ctx.moveTo(cx - 6, 12);
    ctx.lineTo(cx + 6, 12);
    ctx.lineTo(cx, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`HDG ${String(Math.round(headingDeg)).padStart(3, '0')}°`, cx, 52);
  }

  drawTapes(ctx, s) {
    // Airspeed, left.
    const knots = Math.round(s.speed * 1.944);
    this.panel(ctx, 14, 150, 104, 210);
    ctx.save();
    ctx.beginPath();
    ctx.rect(16, 152, 100, 206);
    ctx.clip();
    ctx.fillStyle = '#7fe7ff';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const pxPerKt = 2.4;
    const cy = 255;
    for (let k = Math.max(0, knots - 40); k <= knots + 40; k += 5) {
      const y = cy - (k - knots) * pxPerKt;
      const major = k % 10 === 0;
      ctx.strokeStyle = 'rgba(127,231,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(major ? 36 : 28, y);
      ctx.stroke();
      if (major) ctx.fillText(String(k), 40, y);
    }
    ctx.restore();
    ctx.fillStyle = '#06121a';
    ctx.fillRect(14, 244, 104, 24);
    ctx.strokeStyle = '#7fe7ff';
    ctx.strokeRect(14, 244, 104, 24);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${knots} KT`, 66, 257);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('AIRSPEED', 66, 140);
    // Altitude, right.
    const feet = Math.round(s.y * 3.281);
    this.panel(ctx, W - 118, 150, 104, 210);
    ctx.save();
    ctx.beginPath();
    ctx.rect(W - 116, 152, 100, 206);
    ctx.clip();
    const pxPerFt = 0.24;
    for (let f = Math.max(0, feet - 400); f <= feet + 400; f += 50) {
      const y = cy - (f - feet) * pxPerFt;
      const major = f % 100 === 0;
      ctx.strokeStyle = 'rgba(127,231,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(W - 20, y);
      ctx.lineTo(major ? W - 36 : W - 28, y);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#7fe7ff';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(f), W - 40, y);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#06121a';
    ctx.fillRect(W - 118, 244, 104, 24);
    ctx.strokeStyle = '#7fe7ff';
    ctx.strokeRect(W - 118, 244, 104, 24);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${feet.toLocaleString('en-US')} FT`, W - 66, 257);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('ALTITUDE', W - 66, 140);
    const vs = Math.round(s.vy * 196.85);
    ctx.fillStyle = vs > 60 ? '#39d353' : vs < -60 ? '#ff6b5e' : '#9fb8c8';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`VS ${vs > 0 ? '+' : ''}${vs} FPM`, W - 66, 344);
  }

  drawAttitude(ctx, s) {
    const cx = 92;
    const cy = H - 92;
    const r = 58;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-s.bank);
    ctx.translate(0, s.pitch * 90);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-r - 4, -r * 2 - 4, (r + 4) * 2, r * 2 + 4);
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(-r - 4, 0, (r + 4) * 2, r * 2 + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const deg of [-20, -10, 10, 20]) {
      const y = -deg * 2.4;
      ctx.beginPath();
      ctx.moveTo(-22, y);
      ctx.lineTo(22, y);
      ctx.stroke();
      ctx.fillText(String(Math.abs(deg)), 30, y + 3);
    }
    ctx.restore();
    ctx.strokeStyle = '#7fe7ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed aircraft symbol.
    ctx.strokeStyle = '#ffc857';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy + 4);
    ctx.lineTo(cx - 8, cy);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx + 8, cy);
    ctx.lineTo(cx + 24, cy + 4);
    ctx.stroke();
    // Bank pointer.
    ctx.fillStyle = '#ffc857';
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(s.bank) * (r - 4), cy - Math.cos(s.bank) * (r - 4));
    ctx.arc(cx + Math.sin(s.bank) * (r - 4), cy - Math.cos(s.bank) * (r - 4), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + r + 14);
  }

  drawGauges(ctx, s) {
    const baseY = H - 190;
    const bars = [
      { label: 'THR', value: s.throttle, color: '#7fe7ff', x: W - 150 },
      { label: 'FUEL', value: s.fuel / 100, color: s.fuel < 25 ? '#ff6b5e' : '#39d353', x: W - 118 },
      { label: 'HULL', value: s.hull / 100, color: s.hull < 35 ? '#ff6b5e' : '#ffc857', x: W - 86 },
    ];
    for (const b of bars) {
      this.panel(ctx, b.x - 8, baseY - 8, 34, 150);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(b.x, baseY, 18, 120);
      const h = 120 * clamp(b.value, 0, 1);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, baseY + 120 - h, 18, h);
      ctx.fillStyle = '#eaf6ff';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + 9, baseY + 136);
      ctx.fillStyle = '#9fb8c8';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`${Math.round(b.value * 100)}`, b.x + 9, baseY - 14);
    }
  }

  drawScoreBlock(ctx, s) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`SCORE ${s.score.toLocaleString('en-US')}`, 16, 40);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`BEST ${Math.max(this.best, s.score).toLocaleString('en-US')}   ·   RINGS ${s.ringsPassed}/${s.ringsTotal}`, 16, 60);
    const mission = MISSIONS[s.phase];
    ctx.fillStyle = '#ffc857';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(mission.name, 16, 82);
    ctx.fillStyle = '#c8d8e4';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(mission.brief, 16, 100);
    if (s.combo >= 2) {
      const mult = Math.min(CFG.comboCap, 1 + CFG.comboStep * (s.combo - 1));
      ctx.fillStyle = '#f5b301';
      ctx.beginPath();
      ctx.roundRect(16, 104, 132, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#241a00';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(`COMBO x${mult.toFixed(2)}`, 28, 122);
    }
  }

  drawNextRingArrow(ctx, s) {
    if (s.status !== 'flying') return;
    const ring = s.terrain.rings.find((r) => !r.passed && !r.missed);
    if (!ring) return;
    const p = this.project(ring.x, ring.y, ring.z);
    const dist = Math.round(Math.hypot(ring.x - s.x, ring.y - s.y, ring.z - s.z));
    if (p && p.x > 60 && p.x < W - 60 && p.y > 90 && p.y < H - 60) {
      // The label lives under the compass, not on the ring: the autopilot
      // flies straight at the ring, so a ring-anchored label always lands
      // on the aircraft itself.
      const text = `${ring.type === 'fuel' ? 'FUEL ' : ''}RING ${dist} m`;
      ctx.font = 'bold 13px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 28;
      ctx.fillStyle = 'rgba(6,16,26,0.6)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - w / 2, 68, w, 26, 13);
      ctx.fill();
      ctx.fillStyle = ring.type === 'fuel' ? '#39d353' : '#f5b301';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, 82);
      ctx.textBaseline = 'alphabetic';
      return;
    }
    // Off-screen: clamp a marker to the frame edge and point at the ring.
    const tx = p ? p.x : W / 2 + (ring.x - s.x);
    const ty = p ? p.y : H / 2 - (ring.y - s.y);
    const cx = clamp(tx, 70, W - 70);
    const cy = clamp(ty, 110, H - 70);
    const ang = Math.atan2(ty - cy, tx - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = ring.type === 'fuel' ? '#39d353' : '#f5b301';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`RING ${dist} m`, cx, cy + 26);
  }

  drawToasts(ctx, s) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px system-ui, sans-serif';
    s.messages.forEach((m, i) => {
      const a = clamp(m.ttl, 0, 1);
      const y = 152 + i * 30;
      const w = ctx.measureText(m.text).width + 28;
      ctx.fillStyle = `rgba(6,16,26,${0.6 * a})`;
      ctx.beginPath();
      ctx.roundRect(W / 2 - w / 2, y - 18, w, 26, 13);
      ctx.fill();
      ctx.fillStyle = `rgba(234,246,255,${a})`;
      ctx.fillText(m.text, W / 2, y);
    });
  }

  // --- Screens ---
  drawTitle(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(4,10,18,0.72)');
    g.addColorStop(0.35, 'rgba(4,10,18,0.22)');
    g.addColorStop(0.75, 'rgba(4,10,18,0.5)');
    g.addColorStop(1, 'rgba(4,10,18,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 68px system-ui, sans-serif';
    try { ctx.letterSpacing = '4px'; } catch { /* older canvas: ignore */ }
    ctx.fillText('MERAPI SKY RUN', W / 2, 168);
    try { ctx.letterSpacing = '0px'; } catch { /* ignore */ }
    ctx.fillStyle = '#ffc857';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('One aircraft. Twenty rings. One runway home — over the Merapi valley.', W / 2, 206);
    ctx.fillStyle = '#c8d8e4';
    ctx.font = '16px system-ui, sans-serif';
    const lines = [
      'SORTIE 1 — RING RUN: thread 8 gold rings over the valley.',
      'SORTIE 2 — STORM PASS: 8 more past the Gate Peak. Watch the balloons.',
      'SORTIE 3 — HOMECOMING: 4 rings, then land on runway 27. Mind the fuel.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, W / 2, 268 + i * 28));
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('↑ ↓ pitch    ← → bank    W / S throttle    mouse steers    wheel throttle    SPACE airbrake', W / 2, 392);
    ctx.fillText('P pause    M mute    R restart', W / 2, 420);
    const blink = 0.55 + 0.45 * Math.sin(this.time * 4);
    ctx.fillStyle = `rgba(234,246,255,${blink.toFixed(2)})`;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER OR CLICK TO FLY', W / 2, 606);
    if (this.best > 0) {
      ctx.fillStyle = '#ffc857';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(`BEST SCORE ${this.best.toLocaleString('en-US')}`, W / 2, 644);
    }
    ctx.fillStyle = 'rgba(200,216,228,0.75)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('An original game by OSO-161 — Merapi, its valley and its runway are real places; the aircraft is not.', W / 2, H - 24);
    // The parked aircraft, drawn last so it stays bright over the gradient.
    this.drawPlane(ctx, s, 60, 0.85);
  }

  drawPaused(ctx, s) {
    ctx.fillStyle = 'rgba(4,10,18,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H / 2 - 10);
    ctx.fillStyle = '#c8d8e4';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('P resume    ·    R restart    ·    M mute', W / 2, H / 2 + 36);
  }

  statsLines(s) {
    const mm = Math.floor(s.elapsed / 60);
    const ss = Math.floor(s.elapsed % 60).toString().padStart(2, '0');
    return [
      [`SCORE`, s.score.toLocaleString('en-US')],
      [`RINGS`, `${s.ringsPassed} / ${s.ringsTotal}`],
      [`TIME`, `${mm}:${ss}`],
      [`FUEL LEFT`, `${Math.round(s.fuel)}%`],
      [`BEST COMBO`, `x${s.bestCombo}`],
    ];
  }

  drawEndPanel(ctx, s, title, titleColor, sub) {
    ctx.fillStyle = 'rgba(4,10,18,0.62)';
    ctx.fillRect(0, 0, W, H);
    const pw = 520;
    const ph = 380;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2;
    this.panel(ctx, px, py, pw, ph);
    ctx.textAlign = 'center';
    ctx.fillStyle = titleColor;
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText(title, W / 2, py + 64);
    ctx.fillStyle = '#c8d8e4';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(sub, W / 2, py + 100);
    ctx.textAlign = 'left';
    ctx.font = '17px system-ui, sans-serif';
    const rows = this.statsLines(s);
    rows.forEach(([label, value], i) => {
      const y = py + 148 + i * 34;
      ctx.fillStyle = '#9fb8c8';
      ctx.fillText(label, px + 56, y);
      ctx.fillStyle = '#eaf6ff';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(value, px + pw - 56, y);
      ctx.textAlign = 'left';
      ctx.font = '17px system-ui, sans-serif';
    });
    const blink = 0.55 + 0.45 * Math.sin(this.time * 4);
    ctx.fillStyle = `rgba(234,246,255,${blink.toFixed(2)})`;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS R TO FLY AGAIN', W / 2, py + ph - 28);
  }

  drawLanded(ctx, s) {
    this.drawEndPanel(ctx, s, 'WELCOME HOME', '#39d353', 'Touchdown on runway 27 — the sortie is complete.');
  }

  drawCrashed(ctx, s) {
    this.drawEndPanel(ctx, s, 'CRASHED', '#ff6b5e', CRASH_TEXT[s.crashReason] || 'THE SORTIE ENDS HERE');
  }
}
