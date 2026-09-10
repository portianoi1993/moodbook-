// Self-growing catalog of YouTube mixes. Every real search result is kept for good and reused for
// any later query that means the same thing ("dark ambient reading mix" ≈ "dark ambient music for reading").
// Why: the free YouTube Data API quota allows ~100 searches a day; the catalog answers repeats for free,
// so the more readers use MoodBook, the less the quota matters.
// Storage: mb:ytc:v:<key> → payload (no expiry), mb:ytc:index → list of keys (key = sorted significant words).
import { kvGet, kvSetForever, kvRPush, kvLRange, kvLLen } from './store.js';

const STOP = new Set(('a an the and or of for to in on at with by from into over under no without ' +
  'mix mixes playlist hour hours hr hrs long full best top new hd 4k official version vol volume ' +
  'video videos song songs track tracks 1 2 3 4 5 6 7 8 9 10 12 24').split(' '));
const MAX_WORDS = 8;
const INDEX_LIMIT = 20000;      // newest keys an instance keeps in memory
const REFRESH_MS = 10 * 60 * 1000;
const MATCH = 0.6;              // Jaccard similarity needed to reuse another query's mix
const INDEX = 'mb:ytc:index';
const V = (key) => `mb:ytc:v:${key}`;

let index = null;               // [{ k, ws }] per instance
let indexAt = 0;

/** Significant words of a query: lowercase, accent-free, no stop words, sorted, de-duplicated. */
export function words(q) {
  const out = new Set();
  const plain = String(q || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  for (const w of plain.split(/[^\p{L}\p{N}]+/u)) if (w.length > 1 && !STOP.has(w)) out.add(w);
  return [...out].sort().slice(0, MAX_WORDS);
}
export const keyOf = (ws) => ws.join('+');

/** Today's date in Los Angeles — YouTube's quota day. */
export function pacificDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function similarity(a, b) {
  const B = new Set(b);
  let inter = 0;
  for (const w of a) if (B.has(w)) inter++;
  const union = a.length + b.length - inter;
  return union ? inter / union : 0;
}

async function loadIndex() {
  if (index && Date.now() - indexAt < REFRESH_MS) return index;
  const list = await kvLRange(INDEX, -INDEX_LIMIT, -1);
  if (Array.isArray(list)) {
    index = list.map((k) => ({ k, ws: k.split('+') }));
    indexAt = Date.now();
  } else if (!index) {
    index = [];
    indexAt = Date.now() - REFRESH_MS + 60 * 1000; // store unavailable: try again in a minute
  }
  return index;
}

// YouTube API Services policy III.E.4: stored API Data must be refreshed or deleted within 30 days.
export const REFRESH_AFTER_MS = 30 * 24 * 3600 * 1000;

/** Best stored mix for a query, or null. `exact` means the same set of words was searched before;
 *  `stale` means the entry is older than 30 days and must be re-checked against YouTube before use. */
export async function findInCatalog(q) {
  const ws = words(q);
  if (!ws.length) return null;
  const key = keyOf(ws);
  const idx = await loadIndex();
  let best = null, bestScore = 0;
  for (const e of idx) {
    if (e.k === key) { best = e; bestScore = 1; break; }
    const s = similarity(ws, e.ws);
    if (s > bestScore) { best = e; bestScore = s; }
  }
  if (!best || bestScore < MATCH) return null;
  const payload = await kvGet(V(best.k));
  if (!payload?.videoId || payload.gone) return null;
  const stale = !payload.at || Date.now() - payload.at > REFRESH_AFTER_MS;
  return { payload, key: best.k, exact: bestScore === 1, stale };
}

/** Re-checked against YouTube: store the fresh metadata and a new timestamp. */
export async function refreshCatalog(key, payload) {
  await kvSetForever(V(key), { ...payload, at: Date.now() });
}
/** The video is gone or no longer embeddable: keep a tombstone so the key is never served again. */
export async function dropFromCatalog(key) {
  await kvSetForever(V(key), { gone: true, at: Date.now() });
}

/** Remember a real search result for good. */
export async function addToCatalog(q, payload) {
  const ws = words(q);
  if (!ws.length || !payload?.videoId) return;
  const key = keyOf(ws);
  if (index?.some((e) => e.k === key)) return;
  if (await kvGet(V(key))) return; // another instance stored it while our index was stale
  await kvSetForever(V(key), { ...payload, at: Date.now() });
  await kvRPush(INDEX, key);
  if (index) index.push({ k: key, ws });
}

/** How many distinct queries the catalog can answer without quota (null when the store is down). */
export async function catalogSize() {
  const n = await kvLLen(INDEX);
  return typeof n === 'number' ? n : null;
}
