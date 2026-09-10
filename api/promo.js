// Promo codes: unique, server-side, burn on use.
//
//   POST /api/promo            body {code}            → redeem: {ok, plan:'pro', days, expiresAt, note}
//                              Restore codes from purchases (lib/license.js) are accepted here too:
//                              they never burn and answer {ok, plan:'pro', expiresAt, license:true, code}.
//                              body {code, sync:true} is the app's silent daily re-check (not counted).
//   GET  /api/promo?tx=mb_…    → the restore code of a just-completed checkout, by order id (no token: ids are unguessable)
//   GET  /api/promo?admin=TOKEN&create=1&note=Blogger&days=365&uses=1   → mint a code (owner only)
//   GET  /api/promo?admin=TOKEN&list=1                                   → list codes with status (owner only)
//   GET  /api/promo?admin=TOKEN&revoke=CODE                              → disable a code
//
// Storage: the shared store (Upstash / Vercel KV via lib/store.js). Codes live at mb:promo:<CODE>
// as {plan, days, uses, used, note, createdAt, redeemedAt[], revoked}. The index mb:promo:index
// holds the list of codes for the admin listing. Redemption is atomic per code (INCR on a counter).
// ADMIN_TOKEN env (set by the owner in Vercel) protects minting; without a store the API answers 503.
import { cors, guard, noCache, str } from '../lib/http.js';
import { kvEnabled, kvMemory, kvGet, kvSet, kvIncr } from '../lib/store.js';
import { licenseByTx, redeemLicense, publicView } from '../lib/license.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
function mint() {
  const bytes = new Uint8Array(8); crypto.getRandomValues(bytes);
  const s = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `MB-${s.slice(0, 4)}-${s.slice(4)}`;
}
const normalise = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^MB/, '').replace(/^(.{4})(.{4})$/, 'MB-$1-$2');

// lib/store.js talks to Upstash on Vercel and to an in-process map in local development.
const local = kvMemory();
const get = kvGet, set = kvSet, incr = kvIncr;
const YEAR = 366 * 24 * 3600;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(typeof req.body === 'string' ? req.body : await new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); })); } catch { return {}; }
}

export default async function handler(req, res) {
  if (cors(req, res, 'GET, POST, OPTIONS')) return;
  if (await guard(req, res, { methods: ['GET', 'POST'], max: 30, windowMs: 60 * 60 * 1000 })) return;
  noCache(res);
  if (!kvEnabled() && !local) return res.status(503).json({ error: 'Promo codes need the shared store. Add Upstash for Redis in Vercel (see docs/OPS.md §1).' });

  // ── owner actions ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const q = req.query || {};
    // Back from checkout: the browser asks for its restore code by order id (unguessable, minted by api/liqpay.js).
    if (q.tx) {
      const txId = str(q.tx, 80);
      if (!/^mb_(monthly|annual|lifetime)_[a-z0-9]{8,}$/i.test(txId)) return res.status(400).json({ error: 'invalid' });
      const rec = await licenseByTx(txId);
      if (!rec) return res.status(404).json({ error: 'pending', message: 'Not recorded yet — the webhook may still be on its way.' });
      return res.status(200).json(publicView(rec));
    }
    const token = process.env.ADMIN_TOKEN || '';
    if (!token) return res.status(503).json({ error: 'ADMIN_TOKEN is not set in Vercel env' });
    if (String(q.admin || '') !== token) return res.status(403).json({ error: 'Forbidden' });

    if (q.create === '1') {
      const days = Math.min(36500, Math.max(1, parseInt(q.days, 10) || 365));
      const uses = Math.min(10000, Math.max(1, parseInt(q.uses, 10) || 1));
      const note = str(q.note, 80);
      const code = mint();
      const rec = { code, plan: 'pro', days, uses, used: 0, note, createdAt: new Date().toISOString(), redeemedAt: [], revoked: false };
      await set(`mb:promo:${code}`, rec, 3 * YEAR);
      const index = (await get('mb:promo:index')) || [];
      index.push(code); await set('mb:promo:index', index, 3 * YEAR);
      return res.status(200).json({ ok: true, code, days, uses, note, link: `https://moodbook.ink/?code=${code}` });
    }
    if (q.revoke) {
      const code = normalise(q.revoke); const rec = await get(`mb:promo:${code}`);
      if (!rec) return res.status(404).json({ error: 'Unknown code' });
      rec.revoked = true; await set(`mb:promo:${code}`, rec, 3 * YEAR);
      return res.status(200).json({ ok: true, code, revoked: true });
    }
    if (q.list === '1') {
      const index = (await get('mb:promo:index')) || [];
      const items = [];
      for (const code of index.slice(-500)) { const rec = await get(`mb:promo:${code}`); if (rec) items.push({ code, note: rec.note, days: rec.days, uses: rec.uses, used: rec.used, revoked: !!rec.revoked, createdAt: rec.createdAt, redeemedAt: rec.redeemedAt }); }
      return res.status(200).json({ ok: true, count: items.length, items: items.reverse() });
    }
    return res.status(400).json({ error: 'Use create=1&note=…&days=365&uses=1, list=1 or revoke=CODE' });
  }

  // ── redeem ─────────────────────────────────────────────────────────────────
  const body = await readJson(req);
  const code = normalise(body.code);
  if (!/^MB-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) return res.status(400).json({ error: 'invalid', message: 'That code does not look right.' });
  const rec = await get(`mb:promo:${code}`);
  if (!rec) {
    // Not a promo code — maybe a restore code from a purchase. Those never burn.
    const lic = await redeemLicense(code, { count: body.sync !== true });
    if (!lic) return res.status(404).json({ error: 'unknown', message: 'That code is not valid.' });
    if (lic.expired) return res.status(410).json({ error: 'expired', message: 'The plan behind that code has ended.' });
    return res.status(200).json(publicView(lic.rec));
  }
  if (rec.revoked) return res.status(404).json({ error: 'unknown', message: 'That code is not valid.' });
  // Atomic burn: the counter decides who was first even if two people submit at the same moment.
  const n = await incr(`mb:promo:${code}:used`, 3 * YEAR);
  if (n == null) return res.status(503).json({ error: 'store', message: 'Store unavailable, try again in a minute.' });
  if (n > rec.uses) return res.status(410).json({ error: 'used', message: 'That code has already been used.' });
  rec.used = n; rec.redeemedAt = [...(rec.redeemedAt || []), new Date().toISOString()].slice(-50);
  await set(`mb:promo:${code}`, rec, 3 * YEAR);
  const expiresAt = new Date(Date.now() + rec.days * 24 * 3600 * 1000).toISOString();
  return res.status(200).json({ ok: true, plan: rec.plan, days: rec.days, expiresAt, note: rec.note });
}
