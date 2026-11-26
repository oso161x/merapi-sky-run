// MERAPI SKY RUN — screenshot runner. Serves game/ locally, captures each
// scene from shots.json in headless Chrome at 1280x720 via CDP (the plain
// --screenshot flag races the module paint and captures a blank canvas),
// converts to JPEG (gate cap: 256 KiB each, long side <= 1280, short side
// >= 480) and writes screenshots/. Usage: node tools/shots.mjs [port]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] || 8901);
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/index.html`);
      if (res.ok) return true;
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  return false;
}

const server = spawn('node', ['serve.ts', '--port', String(port)], {
  cwd: here,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write(`[serve] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));

let code = 0;
try {
  if (!(await waitForServer())) {
    console.error('server did not come up');
    code = 1;
  } else {
    mkdirSync(join(here, 'screenshots'), { recursive: true });
    for (const shot of shots) {
      const png = join('/tmp', `merapi-${shot.name}.png`);
      const out = join(here, 'screenshots', shot.name);
      const url = `http://127.0.0.1:${port}/index.html${shot.query}`;
      const run = spawnSync('node', ['tools/cdp.mjs', url, png, '4000'], {
        cwd: here,
        encoding: 'utf8',
        timeout: 90000,
      });
      if (run.status !== 0 || !existsSync(png)) {
        console.error(`FAIL ${shot.name}: cdp exit ${run.status}\n${run.stdout || ''}\n${run.stderr || ''}`);
        code = 1;
        continue;
      }
      // PNG -> JPEG, stepping quality down until under the 256 KiB gate cap.
      let quality = 82;
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        spawnSync('convert', [png, '-quality', String(quality), out], { encoding: 'utf8' });
        const size = statSync(out).size;
        if (size <= 262144) {
          ok = true;
        } else {
          quality -= 12;
        }
      }
      if (!ok) {
        console.error(`FAIL ${shot.name}: still over 256 KiB at quality ${quality}`);
        code = 1;
        continue;
      }
      const dims = spawnSync('identify', ['-format', '%wx%h', out], { encoding: 'utf8' }).stdout.trim();
      const size = statSync(out).size;
      console.log(`${shot.name}: ${dims} ${size} bytes (quality ${quality})`);
    }
  }
} finally {
  server.kill('SIGTERM');
}
process.exit(code);
