// Restore codes for paid plans.
// The Paddle webhook issues one code per purchase (per subscription for recurring plans) and the
// browser shows it in Account. Entering the code in the promo form on any other device restores Pro.
// Each renewal pushes the code's `until` date forward, and the app re-checks its code once a day,
// so a renewed subscription stays Pro without the reader doing anything.
//
// Storage (never expires — these are purchases):
//   mb:lic:<CODE>          {code, plan, until, txIds[], subscriptionId, used, revoked, createdAt}
//   mb:lic:tx:<txn_id>     CODE   (the browser fetches its code right after checkout by transaction id)
//   mb:lic:sub:<sub_id>    CODE   (renewals find the existing code)
import { kvGet, kvSetForever } from './store.js';

export const PRICE_PLAN = {
  pri_01m20m1ehtsv50d1y6782kw8dv: 'monthly',
  pri_01m20mg69ztn0s2b5wsenhfe6j: 'annual',
  pri_01m20mn4r67t468bkfk7z09k6k: 'lifetime',
};
// Days of access per payment — a little longer than the billing period so a late renewal never cuts a reader off.
export const PLAN_DAYS = { monthly: 35, annual: 370, lifetime: 0 };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // same alphabet as promo codes, no 0/O/1/I
export function mintCode() {
  const bytes = new Uint8Array(8); crypto.getRandomValues(bytes);
  const s = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `MB-${s.slice(0, 4)}-${s.slice(4)}`;
}
const K = (code) => `mb:lic:${code}`;

/** Create the code for a completed transaction, or extend the existing one on a renewal. */
export async function issueLicense({ txId, subscriptionId = null, priceId = '' }) {
  const plan = PRICE_PLAN[priceId] || 'annual';
  const days = PLAN_DAYS[plan];
  let code = subscriptionId ? await kvGet(`mb:lic:sub:${subscriptionId}`) : null;
  let rec = code ? await kvGet(K(code)) : null;
  if (!rec) {
    code = mintCode();
    rec = { code, plan, createdAt: new Date().toISOString(), txIds: [], subscriptionId, used: 0, revoked: false };
  }
  rec.plan = plan;
  rec.until = days ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : null;
  rec.txIds = [...new Set([...(rec.txIds || []), txId])].slice(-60);
  await kvSetForever(K(code), rec);
  await kvSetForever(`mb:lic:tx:${txId}`, code);
  if (subscriptionId) await kvSetForever(`mb:lic:sub:${subscriptionId}`, code);
  return rec;
}

export async function licenseByTx(txId) {
  const code = await kvGet(`mb:lic:tx:${txId}`);
  return code ? (await kvGet(K(code))) || null : null;
}

/** Look a code up for restoring; `count` false is the silent daily re-check. */
export async function redeemLicense(code, { count = true } = {}) {
  const rec = await kvGet(K(code));
  if (!rec || rec.revoked) return null;
  if (rec.until && Date.parse(rec.until) < Date.now()) return { expired: true, rec };
  if (count) {
    rec.used = (rec.used || 0) + 1;
    rec.lastRedeemedAt = new Date().toISOString();
    await kvSetForever(K(code), rec);
  }
  return { rec };
}

/** What the browser is allowed to see. */
export const publicView = (rec) => ({ ok: true, plan: 'pro', tier: rec.plan, expiresAt: rec.until, license: true, code: rec.code });
