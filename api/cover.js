// GET /api/cover?u=<https://books.google.com/... | https://covers.openlibrary.org/...>
// Same-origin image proxy so the Reading Card can draw book covers on a <canvas>
// (the publishers' CDNs send no CORS headers, which would taint the canvas).
// Only the two catalogue hosts are allowed; responses are cached at the CDN for a week.
import { cors, guard, noCache, fetchWithTimeout } from '../lib/http.js';

const ALLOWED = new Set(['books.google.com', 'books.googleusercontent.com', 'covers.openlibrary.org']);

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (guard(req, res, { methods: ['GET'], max: 60 })) return;

  let url;
  try { url = new URL(String(req.query?.u || '')); } catch { url = null; }
  if (!url || !/^https?:$/.test(url.protocol) || !ALLOWED.has(url.hostname)) {
    noCache(res);
    return res.status(400).json({ error: 'Unsupported cover URL' });
  }
  if (url.hostname === 'books.google.com') { url.protocol = 'https:'; url.searchParams.set('zoom', '2'); url.searchParams.delete('edge'); }

  try {
    const up = await fetchWithTimeout(url.toString(), { headers: { 'User-Agent': 'MoodBook/1.0 (+https://moodbook-six.vercel.app)' } }, 8000);
    const type = up.headers.get('content-type') || '';
    if (!up.ok || !type.startsWith('image/')) {
      noCache(res);
      return res.status(502).json({ error: 'Cover not available' });
    }
    const buf = Buffer.from(await up.arrayBuffer());
    if (buf.length > 3 * 1024 * 1024) { noCache(res); return res.status(413).json({ error: 'Cover too large' }); }
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(buf);
  } catch (e) {
    noCache(res);
    return res.status(e.name === 'AbortError' ? 504 : 502).json({ error: 'Cover fetch failed' });
  }
}
