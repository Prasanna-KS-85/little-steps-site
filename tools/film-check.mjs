// Dev-only check of the hero film, through headless Google Chrome and the DevTools protocol.
// No npm packages.
//
//   node --experimental-websocket tools/film-check.mjs http://127.0.0.1:8765/ docs/screens
//
// For 1440, 768 and 390 px it writes <out>/film-<width>-poster.png (reduced motion: the poster, nothing
// plays), film-<width>-mid.png (playing, paused at 16 s), film-<width>-nojs.png (JavaScript off), and
// prints JSON: every request on load and after scrolling (all same-origin?), console errors, the video's
// attributes, and whether it wraps from the last frame back to the start by itself.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [, , url = 'http://127.0.0.1:8765/', outDir = 'docs/screens'] = process.argv;
const origin = new URL(url).origin;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(path.join(tmpdir(), 'ls-film-'));
const port = 9334;
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--disable-extensions', '--hide-scrollbars', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
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
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

const report = {};
try {
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const width of [1440, 768, 390]) {
    const r = (report[width] = {});
    const requests = new Map();
    const errors = [];
    const onMsg = (m) => {
      const p = m.params;
      if (m.method === 'Network.requestWillBeSent') requests.set(p.requestId, { url: p.request.url, status: null });
      if (m.method === 'Network.responseReceived' && requests.has(p.requestId)) requests.get(p.requestId).status = p.response.status;
      if (m.method === 'Network.loadingFailed' && requests.has(p.requestId) && !p.canceled) errors.push(`request failed: ${requests.get(p.requestId).url} ${p.errorText}`);
      if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${p.exceptionDetails.text} ${p.exceptionDetails.exception?.description ?? ''}`);
      if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
      if (m.method === 'Log.entryAdded' && p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`);
    };
    listeners.push(onMsg);
    const metrics = { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 };
    const shotFilm = async (file) => {
      const box = await ev(`(() => { const b = document.querySelector('.film-frame').getBoundingClientRect(); return [b.left, b.top + scrollY, b.width, b.height]; })()`);
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: box[0], y: box[1], width: box[2], height: box[3], scale: 1 } });
      writeFileSync(path.join(outDir, file), Buffer.from(s.data, 'base64'));
    };

    // 1. Reduced motion: poster only.
    await send('Emulation.setDeviceMetricsOverride', metrics);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url });
    await sleep(2000);
    await ev(`document.querySelector('.film').scrollIntoView({block:'center'})`);
    await sleep(1500);
    r.reducedMotion = await ev(`(() => { const v = document.getElementById('hero-video'); return { paused: v.paused, currentTime: v.currentTime, started: document.querySelector('.film').classList.contains('film--started'), poster: document.querySelector('.film-frame img').currentSrc.split('/').pop() }; })()`);
    r.reducedMotion.videoRequests = [...requests.values()].map((q) => q.url).filter((u) => u.endsWith('.mp4') && u.includes('hero'));
    await shotFilm(`film-${width}-poster.png`);

    // 2. Normal motion: load, scroll to the film, play, pause at 16 s.
    requests.clear();
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await send('Page.navigate', { url });
    await sleep(2000);
    r.onLoad = [...requests.values()].map((q) => q.url);
    await ev(`document.querySelector('.film').scrollIntoView({block:'center'})`);
    await sleep(2500);
    r.video = await ev(`(() => { const v = document.getElementById('hero-video'); return { src: v.currentSrc.split('/').pop(), muted: v.muted, loop: v.loop, playsinline: v.hasAttribute('playsinline'), controls: v.controls, autoplayedPaused: v.paused, duration: v.duration, videoWidth: v.videoWidth, videoHeight: v.videoHeight, audioBytes: v.webkitAudioDecodedByteCount, started: document.querySelector('.film').classList.contains('film--started') }; })()`);
    await ev(`(() => { const v = document.getElementById('hero-video'); v.pause(); v.currentTime = 16; return new Promise((res) => v.addEventListener('seeked', res, { once: true })); })()`);
    await sleep(500);
    r.mid = await ev(`document.getElementById('hero-video').currentTime`);
    await shotFilm(`film-${width}-mid.png`);

    // 3. Loop seam: play from 0.3 s before the end; the clip must wrap on its own, with no 'ended' event.
    r.loop = await ev(`(async () => {
      const v = document.getElementById('hero-video');
      let ended = false;
      v.addEventListener('ended', () => (ended = true));
      v.currentTime = v.duration - 0.3;
      await new Promise((res) => v.addEventListener('seeked', res, { once: true }));
      let max = 0, wrapped = false;
      v.play();
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 50));
        if (v.currentTime >= max) max = v.currentTime; else { wrapped = true; break; }
      }
      await new Promise((res) => setTimeout(res, 800));
      return { wrapped, ended, maxBeforeWrap: +max.toFixed(2), timeAfter: +v.currentTime.toFixed(2), playingAfter: !v.paused };
    })()`);
    r.requestsAfterScroll = [...requests.values()].map((q) => q.url);

    // 4. JavaScript off: the poster is what you see.
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await send('Page.navigate', { url });
    await sleep(2000);
    r.noJs = await ev(`(() => { const i = document.querySelector('.film-frame img'); const v = document.getElementById('hero-video'); return { posterLoaded: i.complete && i.naturalWidth > 0, poster: i.currentSrc.split('/').pop(), videoOpacity: getComputedStyle(v).opacity, videoPaused: v.paused }; })()`).catch(() => null);
    // With scripts disabled Runtime.evaluate still runs from the protocol, so the values above are real.
    await shotFilm(`film-${width}-nojs.png`);
    await send('Emulation.setScriptExecutionDisabled', { value: false });

    r.errors = errors;
    r.allSameOrigin = [...new Set([...r.onLoad, ...r.requestsAfterScroll])].every((u) => u.startsWith(origin + '/') || u.startsWith('data:'));
    r.thirdParty = [...new Set([...r.onLoad, ...r.requestsAfterScroll])].filter((u) => !u.startsWith(origin + '/') && !u.startsWith('data:'));
    listeners.splice(listeners.indexOf(onMsg), 1);
  }
} finally {
  ws.close();
  chrome.kill('SIGTERM');
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 1));
