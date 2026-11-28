// Dev-only check of "Watch with sound", through headless Google Chrome and the DevTools protocol.
// No npm packages.
//
//   WIDTHS=1440 node --experimental-websocket tools/sound-check.mjs http://127.0.0.1:8766/ docs/screens
//
// One Chrome per run. Run it once per width (WIDTHS=1440, 768, 390): after JavaScript is switched off and
// on again, headless Chrome's renderer hangs when the next width starts in the same process.
//
// For 1440, 768 and 390 px it records requests on load (the film files must not be among them) and after
// the click (same-origin only), writes <out>/sound-<width>-loop.png and sound-<width>-film.png (film
// frame at 8 s), runs a keyboard-only pass with real key events, checks the loop pauses and resumes, the
// automatic return at the end, reduced motion (nothing autoplays, the button still works) and JavaScript
// off (button hidden), and prints JSON.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [, , url = 'http://127.0.0.1:8765/', outDir = 'docs/screens'] = process.argv;
const origin = new URL(url).origin;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(path.join(tmpdir(), 'ls-sound-'));
const port = 9335;
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
  const timer = setTimeout(() => { pending.delete(n); reject(new Error(`timeout: ${method} ${JSON.stringify(params).slice(0, 120)}`)); }, 20000);
  pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;


const report = {};
const key = async (k, code, vk) => {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, text: k === 'Enter' ? '\r' : k === ' ' ? ' ' : undefined });
  if (k === 'Enter' || k === ' ') await send('Input.dispatchKeyEvent', { type: 'char', ...base, text: k === 'Enter' ? '\r' : ' ' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(250);
};
const mouseClick = async (id) => {
  const [x, y] = await ev(`(() => { const b = document.getElementById('${id}'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(250);
};
const TAB = () => key('Tab', 'Tab', 9);
const ENTER = () => key('Enter', 'Enter', 13);
const SPACE = () => key(' ', 'Space', 32);
const ESC = () => key('Escape', 'Escape', 27);
const state = () => ev(`(() => { const l = document.getElementById('hero-video'), f = document.getElementById('film-video'); const a = document.activeElement;
  return { focus: a.id || a.tagName, loopPaused: l.paused, filmPaused: f.paused, filmTime: +f.currentTime.toFixed(1), filmSrc: (f.currentSrc || '').split('/').pop(), filmMuted: f.muted, filmVolume: f.volume,
    watchHidden: document.getElementById('film-watch').hidden, controlsHidden: document.getElementById('film-sound-controls').hidden,
    toggleLabel: document.getElementById('film-toggle').textContent, status: document.getElementById('film-status').textContent, soundClass: document.querySelector('.film').classList.contains('film--sound') }; })()`);
const focusRing = () => ev(`(() => { const a = document.activeElement; const c = getComputedStyle(a); return { id: a.id, outlineStyle: c.outlineStyle, outlineWidth: c.outlineWidth, matchesFocusVisible: a.matches(':focus-visible') }; })()`);
const waitFor = async (expr, ms = 8000) => { for (let t = 0; t < ms; t += 200) { if (await ev(expr)) return true; await sleep(200); } return false; };
try {
  await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const width of (process.env.WIDTHS || '1440,768,390').split(',').map(Number)) {
    const r = (report[width] = {});
    const requests = new Map(); const errors = [];
    const onMsg = (m) => {
      const p = m.params;
      if (m.method === 'Network.requestWillBeSent') requests.set(p.requestId, { url: p.request.url, status: null, range: p.request.headers.Range || p.request.headers.range || null });
      if (m.method === 'Network.responseReceived' && requests.has(p.requestId)) requests.get(p.requestId).status = p.response.status;
      if (m.method === 'Network.loadingFailed' && requests.has(p.requestId) && !p.canceled) errors.push(`request failed: ${requests.get(p.requestId).url} ${p.errorText}`);
      if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${p.exceptionDetails.text} ${p.exceptionDetails.exception?.description ?? ''}`);
      if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
      if (m.method === 'Log.entryAdded' && p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`);
    };
    listeners.push(onMsg);
    const metrics = { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 };
    const shot = async (file) => {
      await ev(`document.querySelector('.film').scrollIntoView({block:'center'})`); await sleep(400);
      const box = await ev(`(() => { const b = document.querySelector('.film').getBoundingClientRect(); return [b.left, b.top + scrollY, b.width, b.height]; })()`);
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: box[0], y: box[1], width: box[2], height: box[3], scale: 1 } });
      writeFileSync(path.join(outDir, file), Buffer.from(s.data, 'base64'));
    };
    const load = async (reduced) => {
      requests.clear();
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
      await send('Page.navigate', { url }); await sleep(2000);
    };
    const filmReqs = () => [...requests.values()].filter((q) => /film-(16x9|4x5)\.mp4/.test(q.url));
    await send('Emulation.setDeviceMetricsOverride', metrics);

    // 1. Normal motion, on load: the film files must not be requested.
    await load(false);
    r.onLoad = { requests: [...requests.values()].map((q) => q.url), filmRequests: filmReqs().length, totalBytesNote: 'see request list' };
    r.onLoad.pageDom = await ev(`(() => { const f = document.getElementById('film-video'); return { filmSrcAttr: f.getAttribute('src'), sources: f.querySelectorAll('source').length, preload: f.preload, networkState: f.networkState, watchVisible: getComputedStyle(document.getElementById('film-watch')).display !== 'none', caption: document.getElementById('film-caption').textContent }; })()`);
    await ev(`document.querySelector('.film').scrollIntoView({block:'center'})`); await sleep(2500);
    r.loopPlaying = await ev(`!document.getElementById('hero-video').paused`);
    r.afterScrollFilmRequests = filmReqs().length;
    await shot(`sound-${width}-loop.png`);

    console.error(width, 'loaded');
    // 2. Keyboard only: Tab to "Watch with sound", Enter; Space pauses; Tab to Back; Enter; focus returns.
    await ev(`document.activeElement.blur(); window.scrollTo(0, 0)`);
    let steps = 0; let reached = false;
    for (; steps < 40; steps++) { await TAB(); if ((await ev(`document.activeElement.id`)) === 'film-watch') { reached = true; break; } }
    r.keyboard = { tabsToWatch: steps + 1, reached, ringOnWatch: await focusRing() };
    requests.clear();
    await ENTER();
    await waitFor(`document.getElementById('film-video').currentTime > 1.5`);
    r.keyboard.afterEnter = await state();
    r.afterClick = { requests: [...requests.values()].map((q) => ({ url: q.url, status: q.status, range: q.range })) };
    r.afterClick.sameOrigin = r.afterClick.requests.every((q) => q.url.startsWith(origin + '/') || q.url.startsWith('data:'));
    r.afterClick.filmFiles = [...new Set(filmReqs().map((q) => q.url.split('/').pop()))];
    r.keyboard.ringOnToggle = await focusRing();
    await ev(`document.getElementById('film-video').currentTime = 8`); await sleep(1200);
    await shot(`sound-${width}-film.png`);
    await SPACE(); r.keyboard.afterSpace = await state();
    await SPACE(); r.keyboard.afterSpaceAgain = await state();
    await TAB(); r.keyboard.tabToBack = { focus: await ev(`document.activeElement.id`), ring: await focusRing() };
    await ENTER(); await sleep(500); r.keyboard.afterBack = await state();
    r.keyboard.loopResumed = await waitFor(`!document.getElementById('hero-video').paused`, 3000);
    // Escape also returns.
    await ENTER(); await waitFor(`document.getElementById('film-video').currentTime > 0.5`); await ESC(); r.keyboard.afterEscape = await state();

    console.error(width, 'keyboard done');
    // 3. The end of the film returns to the loop by itself.
    await mouseClick('film-watch');
    await waitFor(`document.getElementById('film-video').currentTime > 0.5`);
    await ev(`(() => { const f = document.getElementById('film-video'); f.currentTime = f.duration - 0.6; })()`);
    r.end = { duration: await ev(`document.getElementById('film-video').duration`) };
    await waitFor(`document.getElementById('film-sound-controls').hidden`, 6000);
    r.end.after = await state();
    r.end.loopResumed = await waitFor(`!document.getElementById('hero-video').paused`, 3000);

    console.error(width, 'end done');
    // 4. Reduced motion: nothing autoplays; the button still works.
    await load(true);
    await ev(`document.querySelector('.film').scrollIntoView({block:'center'})`); await sleep(1500);
    r.reduced = { loopPausedOnLoad: await ev(`document.getElementById('hero-video').paused`), heroVideoRequests: [...requests.values()].filter((q) => /hero-/.test(q.url) && q.url.endsWith('.mp4')).length, filmRequests: filmReqs().length };
    await mouseClick('film-watch');
    await waitFor(`document.getElementById('film-video').currentTime > 1`);
    r.reduced.afterClick = await state();
    await mouseClick('film-back'); await sleep(600);
    r.reduced.afterBack = await state();
    r.reduced.stillNoAutoplay = r.reduced.afterBack.loopPaused;

    console.error(width, 'reduced done');
    // 5. JavaScript off: poster only, the button is not shown.
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await load(false);
    r.noJs = await ev(`(() => { const b = (id) => getComputedStyle(document.getElementById(id)).display; return { actionsDisplay: b('film-watch') === 'none' || getComputedStyle(document.querySelector('.film-actions')).display, watchDisplay: b('film-watch'), actionsRowDisplay: getComputedStyle(document.querySelector('.film-actions')).display, poster: document.querySelector('.film-frame img').currentSrc.split('/').pop(), filmRequests: 0 }; })()`);
    r.noJs.filmRequests = filmReqs().length;
    await shot(`sound-${width}-nojs.png`);
    await send('Emulation.setScriptExecutionDisabled', { value: false });

    r.errors = errors;
    listeners.splice(listeners.indexOf(onMsg), 1);
  }
} finally {
  ws.close(); chrome.kill('SIGTERM'); await sleep(500); rmSync(profile, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 1));
