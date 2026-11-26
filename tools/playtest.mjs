// MERAPI SKY RUN — live playtest: load the game with no ?shot=, press Enter,
// fly with the keyboard for a few seconds, and report window.__game plus any
// console errors. Proves the interactive loop works in a real browser.
// Usage: node tools/playtest.mjs <base-url> <png-out>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [baseUrl, pngOut] = process.argv.slice(2);
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`,
  '--window-size=1280,720',
  'about:blank',
], { stdio: 'ignore' });

let ws = null;
let id = 0;
const pending = new Map();
const events = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function key(type, code, keyName) {
  await send('Input.dispatchKeyEvent', {
    type, code, key: keyName, windowsVirtualKeyCode: 13,
  });
}
async function main() {
  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        break;
      } catch { await sleep(250); }
    }
    if (!targets) throw new Error('DevTools endpoint never came up');
    const page = targets.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id).resolve(msg.result); pending.delete(msg.id); }
      else if (msg.method) events.push(msg);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${baseUrl}/index.html?seed=7` });
    await sleep(2500);
    const readGame = async () => (await send('Runtime.evaluate', {
      expression: `JSON.stringify(window.__game || null)`, returnByValue: true,
    })).result?.value;
    console.log('before start:', await readGame());
    await key('keyDown', 'Enter', 'Enter');
    await key('keyUp', 'Enter', 'Enter');
    await sleep(500);
    console.log('after Enter:', await readGame());
    // Fly: climb + bank right for 3 s, then level for 2 s.
    await key('keyDown', 'ArrowUp', 'ArrowUp');
    await key('keyDown', 'ArrowRight', 'ArrowRight');
    await sleep(3000);
    await key('keyUp', 'ArrowUp', 'ArrowUp');
    await key('keyUp', 'ArrowRight', 'ArrowRight');
    await sleep(2000);
    console.log('after flying 5s:', await readGame());
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(pngOut, Buffer.from(shot.data, 'base64'));
    console.log('wrote', pngOut);
    for (const ev of events) {
      if (ev.method === 'Runtime.exceptionThrown') {
        console.log('EXCEPTION:', JSON.stringify(ev.params.exceptionDetails).slice(0, 2000));
      } else if (ev.method === 'Runtime.consoleAPICalled' && ev.params.type === 'error') {
        console.log('CONSOLE ERROR:', ev.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    }
    console.log('playtest done, exceptions/errors above (none = clean)');
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
    chrome.kill('SIGTERM');
  }
}
main().catch((e) => { console.error('PLAYTEST FAIL:', e.message); chrome.kill('SIGTERM'); process.exit(1); });
