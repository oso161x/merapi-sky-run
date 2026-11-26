// CDP driver: load a URL in headless Chrome, report console errors and
// exceptions, read window.__game, and capture a screenshot.
// Usage: node tools/cdp.mjs <url> <png-out> [waitMs]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, pngOut, waitMsArg] = process.argv.slice(2);
const waitMs = Number(waitMsArg || 3000);
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 9333;

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

async function main() {
  try {
    // Wait for the DevTools HTTP endpoint.
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        targets = await res.json();
        break;
      } catch {
        await sleep(250);
      }
    }
    if (!targets) throw new Error('DevTools endpoint never came up');
    const page = targets.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id).resolve(msg.result);
        pending.delete(msg.id);
      } else if (msg.method) {
        events.push(msg);
      }
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', { url });
    await sleep(waitMs);
    const evalResult = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        game: window.__game || null,
        canvas: (() => { const c = document.getElementById('game'); return c ? { w: c.width, h: c.height } : null; })(),
        statusText: document.getElementById('status')?.textContent || '',
      })`,
      returnByValue: true,
    });
    console.log('EVAL:', evalResult.result?.value);
    for (const ev of events) {
      if (ev.method === 'Runtime.exceptionThrown') {
        console.log('EXCEPTION:', JSON.stringify(ev.params.exceptionDetails, null, 2).slice(0, 3000));
      } else if (ev.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(ev.params.type)) {
        console.log('CONSOLE', ev.params.type, ev.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    }
    if (pngOut) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(pngOut, Buffer.from(shot.data, 'base64'));
      console.log('wrote', pngOut);
    }
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
    chrome.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error('CDP FAIL:', e.message);
  chrome.kill('SIGTERM');
  process.exit(1);
});
