// Dev-only check of the live Download state, through headless Google Chrome and the DevTools protocol.
// No npm packages.
//
//   node tools/serve.mjs &
//   WIDTHS=1440 node --experimental-websocket tools/download-check.mjs http://127.0.0.1:8766/ docs/screens
//
// One Chrome per width (the renderer can hang if JavaScript is switched off and on in one process). For
// the width it: loads the page and lists every request and console problem; reads the hero and Install
// Download links; Tabs to the hero button with real key events and measures the focus ring; writes
// screenshots; clicks the footer feedback link and reads where it lands; then reloads with JavaScript
// off and reads the links again. The Download link itself is never clicked (that would start a file
// download); its href is compared with the expected URL and fetched separately with curl.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [, , url = 'http://127.0.0.1:8766/', outDir = 'docs/screens'] = process.argv;
const width = Number(process.env.WIDTHS || 1440);
const EXPECT = 'https://github.com/Prasanna-KS-85/little-steps-site/releases/latest/download/Little-Steps.dmg';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(path.join(tmpdir(), 'ls-dl-'));
const port = 9400 + (width % 100);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
  '--disable-sync', '--disable-extensions', '--hide-scrollbars', '--mute-audio', 'about:blank',
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
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (file, clip) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
  writeFileSync(path.join(outDir, file), Buffer.from(r.data, 'base64'));
  return file;
};
const key = async (k, code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
};
const links = `(() => [...document.querySelectorAll('[data-download]')].map((e) => ({
  tag: e.tagName, href: e.getAttribute('href'), text: e.textContent.trim(), disabled: !!e.disabled,
  visible: !!(e.offsetWidth || e.offsetHeight), area: e.closest('.cta') ? 'hero' : 'install' })))()`;

const report = { width };
const requests = [];
const problems = [];
const onMsg = (m) => {
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + (m.params.args[0]?.value ?? ''));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url ?? ''));
  if (m.method === 'Network.loadingFailed') problems.push('failed: ' + m.params.errorText);
};
listeners.push(onMsg);

try {
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });

  // 1. Load with JavaScript.
  await send('Page.navigate', { url });
  await sleep(2500);
  const origin = new URL(url).origin;
  report.requestsOnLoad = requests.length;
  report.foreignRequests = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'));
  report.problems = [...problems];
  report.links = await evalJs(links);
  report.hrefEqualsExpected = report.links.every((l) => l.href === EXPECT);
  report.heroNotes = await evalJs(`[...document.querySelectorAll('.cta p')].map((p) => p.textContent.trim().replace(/\\s+/g, ' '))`);
  report.installFine = await evalJs(`document.querySelector('.install-steps li:first-child').innerText.replace(/\\s+/g, ' ')`);
  report.horizontalScroll = await evalJs('document.documentElement.scrollWidth > document.documentElement.clientWidth');

  // 2. Screenshots with the live button.
  const hero = await evalJs(`(() => { const b = document.querySelector('.cta').getBoundingClientRect(); return [b.top + scrollY, b.height]; })()`);
  report.shots = [await shot(`download-hero-${width}.png`, { x: 0, y: 0, width, height: Math.round(hero[0] + hero[1] + 260) })];
  const ins = await evalJs(`(() => { const b = document.querySelector('.install-steps li:first-child').getBoundingClientRect(); return [b.top + scrollY, b.height]; })()`);
  report.shots.push(await shot(`download-install-${width}.png`, { x: 0, y: Math.max(0, Math.round(ins[0] - 24)), width, height: Math.round(ins[1] + 48) }));

  // 3. Keyboard focus: Tab until the hero Download link has focus (real key events).
  await evalJs('window.scrollTo(0, 0); document.activeElement && document.activeElement.blur()');
  let tabs = 0;
  for (; tabs < 20; tabs++) {
    await key('Tab', 'Tab', 9);
    if (await evalJs(`document.activeElement && document.activeElement.matches('.cta [data-download]')`)) { tabs++; break; }
  }
  report.focus = await evalJs(`(() => { const e = document.activeElement; const s = getComputedStyle(e);
    return { onDownload: e.matches('.cta [data-download]'), focusVisible: e.matches(':focus-visible'),
      outline: s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor, offset: s.outlineOffset }; })()`);
  report.focus.tabsFromTop = tabs;
  const fb = await evalJs(`(() => { const b = document.querySelector('.cta').getBoundingClientRect(); return [b.top + scrollY, b.height]; })()`);
  report.shots.push(await shot(`download-focus-${width}.png`, { x: 0, y: Math.max(0, Math.round(fb[0] - 24)), width, height: Math.round(fb[1] + 48) }));

  // 4. Footer feedback link: a real click, then where it lands.
  await evalJs(`document.documentElement.style.scrollBehavior = 'auto'; [...document.querySelectorAll('footer a')].find((x) => /issues/.test(x.href)).scrollIntoView({ block: 'center' })`);
  await sleep(600);
  const issues = await evalJs(`(() => { const a = [...document.querySelectorAll('footer a')].find((x) => /issues/.test(x.href));
    const b = a.getBoundingClientRect(); const x = b.left + 12, y = b.top + b.height / 2; return { href: a.href, text: a.textContent.trim(), x, y, hit: document.elementFromPoint(x, y) === a }; })()`);
  report.feedbackHit = issues.hit;
  report.feedback = { href: issues.href, text: issues.text };
  await sleep(300);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: issues.x, y: issues.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: issues.x, y: issues.y, button: 'left', clickCount: 1 });
  for (let i = 0; i < 20 && (await evalJs('location.href')) === url; i++) await sleep(500);
  report.feedback.landedOn = await evalJs('location.href');
  report.feedback.title = await evalJs('document.title');

  // 5. JavaScript off.
  listeners.splice(listeners.indexOf(onMsg), 1);
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url });
  await sleep(2000);
  report.noJs = { links: await evalJs(links) };
  report.noJs.hrefEqualsExpected = report.noJs.links.every((l) => l.href === EXPECT);
  report.noJs.shots = [await shot(`download-hero-nojs-${width}.png`, { x: 0, y: 0, width, height: Math.round(hero[0] + hero[1] + 260) })];
} finally {
  ws.close();
  chrome.kill('SIGTERM');
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 1));
