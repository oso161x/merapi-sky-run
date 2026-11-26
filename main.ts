// MERAPI SKY RUN — the hand-in program (Node 22, standard library only).
// It copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Robustness (lesson from roblox-game-01): the grader runs this in a fresh
// container where /output may be owned by the runner but mode 555, or
// otherwise unwritable on first try. Every write goes through withRetry:
// on EACCES/EPERM it chmods the output directory and tries once more, and
// only then fails with a message that says what could not be written and why.
// The program is deterministic: two runs write byte-identical files.
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const NAME = 'merapi-sky-run';
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  console.error(`${NAME}: ${message}`);
  process.exit(1);
}

// Run fn; on a permission error, open up the output directory and retry once.
function withRetry(label, fn) {
  try {
    return fn();
  } catch (err) {
    const code = err && err.code;
    if (code === 'EACCES' || code === 'EPERM') {
      try {
        chmodSync(out, 0o777);
      } catch {
        // The directory is not ours to fix; the retry below will say so.
      }
      try {
        return fn();
      } catch (err2) {
        fail(`cannot write ${label} to ${out} (${err2.code || err2.message})`);
      }
    }
    fail(`cannot write ${label} to ${out} (${code || err.message})`);
  }
}

withRetry('output directory', () => mkdirSync(out, { recursive: true }));

if (existsSync(join(out, 'game'))) {
  withRetry('stale game/', () => rmSync(join(out, 'game'), { recursive: true, force: true }));
}
withRetry('game/', () => cpSync(join(here, 'game'), join(out, 'game'), { recursive: true }));

withRetry('screenshots directory', () => mkdirSync(join(out, 'screenshots'), { recursive: true }));
if (existsSync(join(here, 'screenshots'))) {
  withRetry('screenshots/', () => cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true }));
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
withRetry('dossier.json', () =>
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      game_max_files: 993,
      game_max_bytes: 50331648,
      game_path_max_bytes: 1000,
    }),
  ),
);

console.log(`${NAME}: wrote ${out}`);
