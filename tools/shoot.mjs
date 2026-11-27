// Dev-only check: full-page screenshots and a list of every URL a page loads, through headless
// Google Chrome and the DevTools protocol. No npm packages.
//
//   node --experimental-websocket tools/shoot.mjs http://127.0.0.1:8765/ docs/screens
//
// Writes <out>/home-<width>.png for 390, 768 and 1440 px and prints JSON with every request
// (URL, type, bytes) per width, after scrolling to the bottom so lazy images load. Chrome runs with
// a throwaway profile and is closed at the end.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [, , url = 'http://127.0.0.1:8765/', outDir = 'docs/screens', ...flags] = process.argv;
const reduced = flags.includes('--reduced-motion');
const name = flags.find((f) => f.startsWith('--name='))?.slice(7) ?? 'home';
const widths = (flags.find((f) => f.startsWith('--widths='))?.slice(9) ?? '390,768,1440').split(',').map(Number);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(path.join(tmpdir(), 'ls-shoot-'));
const port = 9333;
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--disable-extensions',
  '--hide-scrollbars',
  '--mute-audio',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) listeners.forEach((l) => l(msg));
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

const report = {};
try {
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const width of widths) {
    const requests = new Map();
    const onMsg = (m) => {
      if (m.method === 'Network.requestWillBeSent') requests.set(m.params.requestId, { url: m.params.request.url, type: m.params.type, bytes: 0, status: null });
      if (m.method === 'Network.responseReceived' && requests.has(m.params.requestId)) requests.get(m.params.requestId).status = m.params.response.status;
      if (m.method === 'Network.loadingFinished' && requests.has(m.params.requestId)) requests.get(m.params.requestId).bytes = m.params.encodedDataLength;
    };
    listeners.push(onMsg);
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await send('Page.navigate', { url });
    await sleep(1500);
    // Load phase only: what the page fetches before anyone scrolls.
    const beforeScroll = [...requests.values()].map((r) => r.url);
    const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
    const height = result.value;
    for (let y = 0; y <= height; y += 600) {
      await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${y})` });
      await sleep(250);
    }
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0); document.querySelectorAll("video").forEach(v => { v.pause(); v.currentTime = 0; });' });
    await sleep(800);
    const full = (await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })).result.value;
    await send('Emulation.setDeviceMetricsOverride', { width, height: full, deviceScaleFactor: 1, mobile: width < 768 });
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: full, scale: 1 } });
    const file = path.join(outDir, `${name}-${width}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    listeners.splice(listeners.indexOf(onMsg), 1);
    report[width] = { file, height: full, onLoad: beforeScroll, all: [...requests.values()] };
  }
} finally {
  ws.close();
  chrome.kill('SIGTERM');
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 1));
