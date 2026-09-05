// GET /api/search?q=...  → best embeddable long YouTube video for a query
// Requires YT_API_KEY (server-side only, never shipped to the browser).
// Quota: search.list costs 100 of the free 10 000 daily units, so every answer is cached for a week
// (memory + shared store) and, once YouTube reports quotaExceeded, we serve evergreen mixes until
// the quota resets at midnight Pacific time instead of failing.
import { cors, guard, cacheFor, noCache, str, fetchWithTimeout } from '../lib/http.js';
import { layeredCache, getFlag, setFlag } from '../lib/store.js';
import { pickEvergreen } from '../lib/evergreen.js';

const cache = layeredCache('yt', { limit: 1000 });
const BLOCK = /lyrics|karaoke|vocal|sing|cover song|reaction|podcast|asmr talk|tutorial|review|trailer/i;
let quotaDownUntil = 0; // per-instance mirror of the shared flag

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});

function isoToSec(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

/** Seconds until the next midnight in Los Angeles (when YouTube's daily quota resets). */
function secondsToPacificMidnight() {
  const now = new Date();
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const next = new Date(la); next.setHours(24, 0, 0, 0);
  return Math.max(60, Math.round((next - la) / 1000));
}

async function quotaIsDown() {
  if (Date.now() < quotaDownUntil) return true;
  const until = await getFlag('yt-quota-down');
  if (until && Date.now() < until) { quotaDownUntil = until; return true; }
  return false;
}
async function markQuotaDown() {
  const until = Date.now() + secondsToPacificMidnight() * 1000;
  quotaDownUntil = until;
  await setFlag('yt-quota-down', until, secondsToPacificMidnight());
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (await guard(req, res, { methods: ['GET'], max: 120 })) return;

  const q = str(req.query?.q, 160);
  if (!q) {
    noCache(res);
    return res.status(400).json({ error: 'Missing query' });
  }
  const key = process.env.YT_API_KEY;
  if (!key) {
    noCache(res);
    return res.status(500).json({ error: 'Server configuration error', detail: 'YT_API_KEY is not set' });
  }

  const cacheKey = q.toLowerCase();
  const hit = await cache.get(cacheKey);
  if (hit) {
    cacheFor(res, 24 * 3600);
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(hit);
  }

  const seed = [...q].reduce((a, c) => a + c.charCodeAt(0), 0);
  if (await quotaIsDown()) {
    // Do not cache: the moment the quota is back, the real search should run.
    noCache(res);
    res.setHeader('X-Fallback', 'quota');
    return res.status(200).json(pickEvergreen(q, seed));
  }

  try {
    const sp = new URLSearchParams({
      part: 'snippet', q, type: 'video', maxResults: '10',
      videoEmbeddable: 'true', videoSyndicated: 'true', videoDuration: 'long',
      safeSearch: 'moderate', key,
    });
    const r = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/search?${sp}`, {}, 8000);
    const d = await r.json();
    if (!r.ok) {
      const msg = d?.error?.message || `YouTube search ${r.status}`;
      const reason = (d?.error?.errors || []).map((x) => x.reason).join(',');
      if (r.status === 403 && /quota/i.test(reason + msg)) {
        console.error('[search] YouTube quota exhausted → evergreen mixes until Pacific midnight');
        await markQuotaDown();
        noCache(res);
        res.setHeader('X-Fallback', 'quota');
        return res.status(200).json(pickEvergreen(q, seed));
      }
      throw new Error(msg);
    }
    const items = d.items || [];
    if (!items.length) {
      const empty = { videoId: null };
      await cache.set(cacheKey, empty, 3600 * 1000);
      cacheFor(res, 3600);
      return res.status(200).json(empty);
    }

    const ids = items.map((v) => v.id.videoId).join(',');
    const vp = new URLSearchParams({ part: 'status,contentDetails,statistics', id: ids, key });
    const vr = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/videos?${vp}`, {}, 8000);
    const vd = await vr.json();
    const meta = new Map((vd.items || []).map((v) => [v.id, v]));

    const ranked = items
      .map((it) => {
        const m = meta.get(it.id.videoId);
        const secs = isoToSec(m?.contentDetails?.duration);
        const views = +(m?.statistics?.viewCount || 0);
        const title = decode(it.snippet?.title || '');
        let s = Math.log10(1 + views) * 10;
        if (secs >= 3600) s += 15; else if (secs >= 1500) s += 6; else s -= 20;
        if (BLOCK.test(title)) s -= 40;
        if (/instrumental|ambient|no lyrics|soundtrack|music for|reading|study/i.test(title)) s += 6;
        const ok = m?.status?.embeddable !== false && (m?.status?.privacyStatus || 'public') === 'public';
        return { it, m, secs, views, s: ok ? s : -999 };
      })
      .filter((x) => x.s > -999)
      .sort((a, b) => b.s - a.s);

    const pick = ranked[0] || { it: items[0], secs: 0, views: 0 };
    const sn = pick.it.snippet || {};
    const payload = {
      videoId: pick.it.id.videoId,
      title: decode(sn.title) || q,
      channel: decode(sn.channelTitle || ''),
      thumb: sn.thumbnails?.medium?.url || '',
      seconds: pick.secs,
      views: pick.views,
      alternatives: ranked.slice(1, 4).map((x) => ({ videoId: x.it.id.videoId, title: decode(x.it.snippet?.title || '') })),
    };
    await cache.set(cacheKey, payload, 7 * 24 * 3600 * 1000); // a good mix for a query stays good for a week
    cacheFor(res, 24 * 3600);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (e) {
    console.error('[search] failed:', e.message);
    // Any other upstream failure: still play something that fits rather than an error.
    noCache(res);
    res.setHeader('X-Fallback', 'error');
    const ev = pickEvergreen(q, seed); ev.reason = str(e.message, 160);
    return res.status(200).json(ev);
  }
}
