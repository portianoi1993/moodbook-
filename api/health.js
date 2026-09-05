// GET /api/health          → which env vars / providers are configured (no secrets)
// GET /api/health?probe=1  → also pings every AI provider in the fallback chain and reports the real upstream answer
import { cors, guard, noCache } from '../lib/http.js';
import { getProviders, probeAll } from '../lib/ai.js';

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (guard(req, res, { methods: ['GET'], max: 12 })) return;
  noCache(res);

  const providers = getProviders().map((p) => ({ provider: p.name, model: p.model, host: new URL(p.baseUrl).host }));
  const out = {
    ok: providers.length > 0,
    env: {
      ai: providers.length > 0,
      youtube: !!process.env.YT_API_KEY,
      books: !!(process.env.GOOGLE_BOOKS_KEY || process.env.YT_API_KEY),
    },
    providers,
    region: process.env.VERCEL_REGION || null,
    time: new Date().toISOString(),
  };
  if (!out.env.youtube) out.hint = 'Set YT_API_KEY in Vercel (Production + Preview) — YouTube search and book covers need it.';

  if (req.query?.probe === '1') {
    out.probe = await probeAll();
    out.ok = out.ok && out.probe.some((p) => p.ok);
  }
  return res.status(out.ok ? 200 : 503).json(out);
}
