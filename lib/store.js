// Persistent key-value store for caches and rate limits that must survive cold starts.
// Speaks the Upstash Redis REST protocol (what Vercel Marketplace "Upstash for Redis" and the
// older Vercel KV both provide). No SDK, plain fetch. Everything is fail-safe: when the env
// variables are missing or the store is unreachable, callers silently fall back to memory.
//
// Env (either pair):  UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//                     KV_REST_API_URL + KV_REST_API_TOKEN
import { fetchWithTimeout, makeCache } from './http.js';

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
let disabledUntil = 0; // back off for a minute after a failure so a dead store never slows every request

export const kvEnabled = () => !!(URL_ && TOKEN);

async function cmd(parts, timeoutMs = 2500) {
  if (!kvEnabled() || Date.now() < disabledUntil) return null;
  try {
    const r = await fetchWithTimeout(`${URL_.replace(/\/+$/, '')}/${parts.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }, timeoutMs);
    const d = await r.json();
    if (!r.ok || d?.error) throw new Error(d?.error || `KV ${r.status}`);
    return d.result;
  } catch (e) {
    console.warn('[store] unavailable:', e.message);
    disabledUntil = Date.now() + 60 * 1000;
    return null;
  }
}

export async function kvGet(key) {
  const raw = await cmd(['get', key]);
  if (raw == null) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}
export async function kvSet(key, value, ttlSec) {
  return cmd(['set', key, JSON.stringify(value), 'EX', String(Math.max(1, Math.round(ttlSec)))]);
}
/** Atomic counter with a window; returns the new count or null when the store is unavailable. */
export async function kvIncr(key, ttlSec) {
  const n = await cmd(['incr', key]);
  if (n === 1) await cmd(['expire', key, String(Math.max(1, Math.round(ttlSec)))]);
  return typeof n === 'number' ? n : null;
}
export async function kvPing() {
  const t0 = Date.now();
  const r = await cmd(['ping'], 2000);
  return { ok: r === 'PONG', ms: Date.now() - t0 };
}

/**
 * Two-layer cache: memory first (fast, per instance), then the shared store (survives cold starts,
 * shared by every instance and region). Values must be JSON-serialisable.
 */
export function layeredCache(name, { limit = 500 } = {}) {
  const mem = makeCache(limit);
  const k = (key) => `mb:${name}:${key}`;
  return {
    async get(key) {
      const m = mem.get(key);
      if (m !== undefined) return m;
      const v = await kvGet(k(key));
      if (v !== undefined) mem.set(key, v, 10 * 60 * 1000);
      return v;
    },
    async set(key, value, ttlMs, { shared = true } = {}) {
      mem.set(key, value, ttlMs);
      if (shared) await kvSet(k(key), value, ttlMs / 1000);
    },
  };
}

/** Short-lived shared flag, e.g. "YouTube quota exhausted until midnight". */
export async function getFlag(name) { return kvGet(`mb:flag:${name}`); }
export async function setFlag(name, value, ttlSec) { return kvSet(`mb:flag:${name}`, value, ttlSec); }

// Let the request guard count across instances when a store is configured.
import { useSharedCounter } from './http.js';
useSharedCounter(kvEnabled() ? kvIncr : null);
