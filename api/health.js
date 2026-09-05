// GET /api/health          → which env vars / providers are configured (no secrets)
// GET /api/health?probe=1  → also pings every AI provider in the fallback chain and reports the real upstream answer
import { cors, guard, noCache } from '../lib/http.js';
import { getProviders, probeAll, listModels } from '../lib/ai.js';
import { kvEnabled, kvPing, getFlag } from '../lib/store.js';

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (await guard(req, res, { methods: ['GET'], max: 12 })) return;
  noCache(res);

  const providers = getProviders().map((p) => ({ provider: p.name, model: p.model, host: new URL(p.baseUrl).host }));
  const out = {
    ok: providers.length > 0,
    env: {
      ai: providers.length > 0,
      youtube: !!process.env.YT_API_KEY,
      books: !!(process.env.GOOGLE_BOOKS_KEY || process.env.YT_API_KEY),
      store: kvEnabled(), // shared cache + cross-instance rate limit (Upstash/Vercel KV env present)
    },
    providers,
    region: process.env.VERCEL_REGION || null,
    time: new Date().toISOString(),
  };
  if (!out.env.youtube) out.hint = 'Set YT_API_KEY in Vercel (Production + Preview) — YouTube search and book covers need it.';
  if (!out.env.store) out.storeHint = 'Add "Upstash for Redis" from the Vercel Marketplace (free plan) so caches and rate limits survive cold starts.';

  if (req.query?.probe === '1') {
    out.probe = await probeAll();
    out.ok = out.ok && out.probe.some((p) => p.ok);
    if (kvEnabled()) out.store = await kvPing();
    const yt = await getFlag('yt-quota-down'); if (yt && Date.now() < yt) out.youtubeQuota = { exhaustedUntil: new Date(yt).toISOString() };
    const gb = await getFlag('gb-quota-down'); if (gb && Date.now() < gb) out.googleBooksQuota = { pausedUntil: new Date(gb).toISOString() };
  }
  if (req.query?.models === '1') {
    // Model ids visible to each key (helps pick quota-sibling models); never returns secrets.
    out.models = await Promise.all(getProviders().map(async (p) => {
      try { return { provider: p.name, ids: await listModels(p) }; } catch (e) { return { provider: p.name, error: e.message }; }
    }));
  }
  return res.status(out.ok ? 200 : 503).json(out);
}
