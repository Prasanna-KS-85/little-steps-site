// Dev-only check of the hero contact line and the FAQ contact entry, through headless Google Chrome and
// the DevTools protocol. No npm packages.
//
//   node tools/serve.mjs &
//   WIDTHS=1440 node --experimental-websocket tools/contact-check.mjs http://127.0.0.1:8766/ docs/screens
//
// One Chrome per width. For the width it: loads the page (requests, console problems, horizontal scroll),
// measures the hero (section, Download button, note card) so a before/after run can be compared, reads the
// contact links (href, target, rel, accessible name, visible, font size against the note), Tabs from the
// top with real key events and records the focus order and the focus ring on each contact link, writes
// screenshots of the hero and of the FAQ contact entry (set SHOTS=0 to skip), and reloads with JavaScript
// off to read the links again. Links are never clicked: they leave the site.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [, , url = 'http://127.0.0.1:8766/', outDir = 'docs/screens'] = process.argv;
const width = Number(process.env.WIDTHS || 1440);
const shots = process.env.SHOTS !== '0';
const EXPECT = { LinkedIn: 'https://www.linkedin.com/in/prasanna-kumar-k-s/', Instagram: 'https://www.instagram.com/prasanna__85/' };
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(path.join(tmpdir(), 'ls-contact-'));
const port = 9500 + (width % 100);
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
const rectOf = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect();
  return { top: Math.round((b.top + scrollY) * 10) / 10, height: Math.round(b.height * 10) / 10, left: Math.round(b.left * 10) / 10, width: Math.round(b.width * 10) / 10 }; })()`;
const contactLinks = `(() => [...document.querySelectorAll('.maker-contact a, .faq a[aria-label^="Message Prasanna"]')].map((e) => {
  const s = getComputedStyle(e); const note = getComputedStyle(document.querySelector('.maker-note p, p.maker-note'));
  return { where: e.closest('.maker-note') ? 'hero' : 'faq', text: e.textContent.trim(), href: e.getAttribute('href'), target: e.getAttribute('target'),
    rel: e.getAttribute('rel'), name: e.getAttribute('aria-label'), visible: !!(e.offsetWidth || e.offsetHeight),
    fontPx: s.fontSize, noteFontPx: note.fontSize, color: s.color, background: s.backgroundColor }; }))()`;
const linkOk = (l) => l.href === EXPECT[l.text] && l.target === '_blank' && l.rel === 'noopener noreferrer'
  && l.name === `Message Prasanna on ${l.text} (opens in a new tab)` && l.visible;

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

  // 1. Load with JavaScript: requests, problems, layout numbers.
  await send('Page.navigate', { url });
  await sleep(2500);
  const origin = new URL(url).origin;
  report.requestsOnLoad = requests.length;
  report.foreignRequests = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'));
  report.problems = [...problems];
  report.horizontalScroll = await evalJs('document.documentElement.scrollWidth > document.documentElement.clientWidth');
  report.layout = { hero: await evalJs(rectOf('.hero')), cta: await evalJs(rectOf('.cta')), button: await evalJs(rectOf('.cta .button')),
    note: await evalJs(rectOf('.maker-note')), film: await evalJs(rectOf('.film')) };
  report.links = await evalJs(contactLinks);
  report.linksOk = report.links.length === 4 && report.links.every(linkOk);
  report.footerFeedback = await evalJs(`(() => { const a = [...document.querySelectorAll('footer a')].find((x) => /issues/.test(x.href));
    return a && { href: a.getAttribute('href'), text: a.textContent.trim() }; })()`);
  report.faqIssuesHref = await evalJs(`(() => { const a = [...document.querySelectorAll('.faq a')].find((x) => /issues/.test(x.href)); return a && a.getAttribute('href'); })()`);

  // 2. Keyboard: Tab from the top, record the first 12 stops, and the ring on each contact link.
  await evalJs('window.scrollTo(0, 0); document.activeElement && document.activeElement.blur()');
  report.focusOrder = [];
  report.rings = {};
  for (let i = 0; i < 12; i++) {
    await key('Tab', 'Tab', 9);
    const f = await evalJs(`(() => { const e = document.activeElement; const s = getComputedStyle(e);
      return { text: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 60), focusVisible: e.matches(':focus-visible'),
        outline: s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor, offset: s.outlineOffset, inHeroNote: !!e.closest('.maker-note') }; })()`);
    report.focusOrder.push(f.text);
    if (f.inHeroNote) {
      report.rings[f.text] = { focusVisible: f.focusVisible, outline: f.outline, offset: f.offset };
      if (shots && /LinkedIn|Instagram/.test(f.text)) {
        const n = await evalJs(rectOf('.maker-note'));
        await shot(`contact-focus-${/LinkedIn/.test(f.text) ? 'linkedin' : 'instagram'}-${width}.png`, { x: 0, y: Math.max(0, Math.round(n.top - 24)), width, height: Math.round(n.height + 48) });
      }
    }
  }

  // 3. Screenshots: the hero, and the FAQ contact entry.
  if (shots) {
    const hero = report.layout.note;
    report.shots = [await shot(`contact-hero-${width}.png`, { x: 0, y: 0, width, height: Math.round(hero.top + hero.height + 120) })];
    const dt = await evalJs(`(() => { const t = [...document.querySelectorAll('.faq dt')].find((x) => /question or send feedback/.test(x.textContent));
      const d = t.nextElementSibling; const a = t.getBoundingClientRect(), b = d.getBoundingClientRect();
      return { top: a.top + scrollY, height: b.bottom - a.top }; })()`);
    report.shots.push(await shot(`contact-faq-${width}.png`, { x: 0, y: Math.max(0, Math.round(dt.top - 96)), width, height: Math.round(dt.height + 192) }));
  }

  // 4. JavaScript off.
  listeners.splice(listeners.indexOf(onMsg), 1);
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url });
  await sleep(2000);
  report.noJs = { links: await evalJs(contactLinks) };
  report.noJs.linksOk = report.noJs.links.length === 4 && report.noJs.links.every(linkOk);
} finally {
  ws.close();
  chrome.kill('SIGTERM');
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
console.log(JSON.stringify(report));
