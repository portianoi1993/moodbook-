// GET /api/health          → which env vars are configured (booleans only)
// GET /api/health?probe=1  → also makes a tiny AI call and reports the upstream answer
import { cors, guard, noCache, str, fetchWithTimeout } from '../lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (guard(req, res, { methods: ['GET'], max: 12 })) return;
  noCache(res);

  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const out = {
    ok: true,
    env: {
      ai: !!key,
      youtube: !!process.env.YT_API_KEY,
      books: !!(process.env.GOOGLE_BOOKS_KEY || process.env.YT_API_KEY),
    },
    ai: { model, host: (() => { try { return new URL(baseUrl).host; } catch { return baseUrl; } })() },
    region: process.env.VERCEL_REGION || null,
    time: new Date().toISOString(),
  };

  if (req.query?.probe === '1') {
    if (!key) {
      out.ok = false;
      out.probe = { status: 0, error: 'AI key missing' };
    } else {
      const t0 = Date.now();
      try {
        const r = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Reply with OK' }] }),
        }, 15000);
        const text = await r.text();
        let msg = '';
        try { const j = JSON.parse(text); msg = j.error?.message || j.choices?.[0]?.message?.content || ''; } catch { msg = text; }
        out.probe = { status: r.status, ms: Date.now() - t0, message: str(msg, 200) };
        if (!r.ok) out.ok = false;
      } catch (e) {
        out.ok = false;
        out.probe = { status: 0, ms: Date.now() - t0, error: str(e.message, 200) };
      }
    }
  }
  return res.status(out.ok ? 200 : 503).json(out);
}
