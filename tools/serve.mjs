// Dev-only static server that supports HTTP Range requests (Python's http.server does not, and then
// seeking in a video fails). No npm packages.
//
//   node tools/serve.mjs [port]        (default 8766, bound to 127.0.0.1)
//
// Logs one line per request to stdout: method, status, range header, path.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8766);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mp4': 'video/mp4',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let st;
  try { st = statSync(file); if (st.isDirectory()) { file = path.join(file, 'index.html'); st = statSync(file); } }
  catch { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); createReadStream(path.join(root, '404.html')).pipe(res); console.log(req.method, 404, '-', url.pathname); return; }
  const headers = { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'accept-ranges': 'bytes' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : st.size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
    end = Math.min(end, st.size - 1);
    if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end(); console.log(req.method, 416, req.headers.range, url.pathname); return; }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return void res.end();
    createReadStream(file, { start, end }).pipe(res);
    console.log(req.method, 206, req.headers.range, url.pathname);
  } else {
    res.writeHead(200, { ...headers, 'content-length': st.size });
    if (req.method === 'HEAD') return void res.end();
    createReadStream(file).pipe(res);
    console.log(req.method, 200, '-', url.pathname);
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
