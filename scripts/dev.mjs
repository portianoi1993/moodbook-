// Local dev server: serves the static site and mounts /api/*.js the way Vercel does.
// Usage:  node scripts/dev.mjs   (reads .env.local for keys)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 3939);

// .env.local → process.env (never committed)
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

function vercelRes(res) {
  const r = {
    _status: 200,
    setHeader: (k, v) => res.setHeader(k, v),
    status(c) { r._status = c; return r; },
    json(o) { res.writeHead(r._status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); },
    send(b) { res.writeHead(r._status); res.end(b); },
    end(b) { res.writeHead(r._status); res.end(b); },
  };
  return r;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9_-]/gi, '');
    const file = path.join(ROOT, 'api', `${name}.js`);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('no such function'); }
    try {
      const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
      req.query = Object.fromEntries(url.searchParams);
      req.body = await readBody(req);
      await mod.default(req, vercelRes(res));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'dev server error', detail: String(e.message) }));
    }
    return;
  }
  let p = decodeURIComponent(url.pathname);
  let file = path.join(ROOT, p);
  if (!p.includes('.') || !fs.existsSync(file)) file = path.join(ROOT, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`MoodBook dev → http://localhost:${PORT}`));
