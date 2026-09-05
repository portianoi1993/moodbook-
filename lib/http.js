// Shared helpers for the serverless functions in /api.
// Plain Node, no dependencies.

const buckets = new Map();

/**
 * Simple in-memory rate limiter. Lives per warm instance, so it is a
 * best-effort guard against abuse rather than a hard quota.
 */
export function rateLimit(ip, { max = 30, windowMs = 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  let rec = buckets.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + windowMs };
    buckets.set(ip, rec);
  }
  rec.count += 1;
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }
  return {
    ok: rec.count <= max,
    remaining: Math.max(0, max - rec.count),
    retryAfter: Math.ceil((rec.resetAt - now) / 1000),
  };
}

export function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/** CORS + preflight. Returns true when the request was fully handled. */
export function cors(req, res, methods = 'GET, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/** Guard: rate limit + method check. Returns true when the request was rejected. */
export function guard(req, res, { methods = ['GET'], max = 30, windowMs } = {}) {
  if (!methods.includes(req.method)) {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }
  // Service is not provided in the Russian Federation (pages are rewritten to /blocked.html in vercel.json).
  if (String(req.headers['x-vercel-ip-country'] || '').toUpperCase() === 'RU') {
    res.status(451).json({ error: 'Not available in your region' });
    return true;
  }
  const scope = String(req.url || '').split('?')[0];
  const lim = rateLimit(`${scope}|${clientIp(req)}`, { max, windowMs });
  res.setHeader('X-RateLimit-Remaining', String(lim.remaining));
  if (!lim.ok) {
    res.setHeader('Retry-After', String(lim.retryAfter));
    res.status(429).json({
      error: 'Too many requests. Please try again in a bit.',
      retryAfter: lim.retryAfter,
    });
    return true;
  }
  return false;
}

/** CDN cache for GET responses (Vercel edge honours s-maxage). */
export function cacheFor(res, seconds, swr = seconds * 4) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${swr}`
  );
}

export function noCache(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export function str(v, max = 200) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Tiny in-memory LRU-ish cache for expensive upstream calls. */
export function makeCache(limit = 500) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.exp < Date.now()) {
        map.delete(key);
        return undefined;
      }
      map.delete(key);
      map.set(key, hit);
      return hit.value;
    },
    set(key, value, ttlMs) {
      map.set(key, { value, exp: Date.now() + ttlMs });
      if (map.size > limit) map.delete(map.keys().next().value);
    },
  };
}

/** fetch with a hard timeout so a slow upstream cannot hang the function. */
export async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
